import logging
import pickle
import uuid
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
from sentence_transformers import SentenceTransformer
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

logger = logging.getLogger(__name__)


class RAGPipeline:
    def __init__(
        self,
        persist_directory: str = "/app/backend/chroma_db",
        llm_model_name: str = "google/flan-t5-small",
    ):
        self.persist_directory = persist_directory
        self.index_path = Path(self.persist_directory) / "index.pkl"
        self.embedding_model: Optional[SentenceTransformer] = None
        self.index: List[Dict] = []
        self.llm_model: Optional[AutoModelForSeq2SeqLM] = None
        self.llm_tokenizer: Optional[AutoTokenizer] = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.llm_model_name = llm_model_name

        self._initialize_embeddings()
        self._load_index()
        self._initialize_llm()

    def _initialize_embeddings(self) -> None:
        try:
            logger.info("Loading sentence-transformer embeddings.")
            self.embedding_model = SentenceTransformer(
                "sentence-transformers/all-MiniLM-L6-v2", device=self.device
            )
            logger.info("Embeddings initialized successfully.")
        except Exception as exc:
            logger.error(f"Failed to initialize embeddings: {exc}")
            raise

    def _load_index(self) -> None:
        try:
            Path(self.persist_directory).mkdir(parents=True, exist_ok=True)
            if self.index_path.exists():
                with self.index_path.open("rb") as fh:
                    raw_entries = pickle.load(fh)
                self.index = []
                for entry in raw_entries:
                    embedding = np.array(entry["embedding"], dtype=np.float32)
                    self.index.append(
                        {
                            "id": entry["id"],
                            "embedding": embedding,
                            "text": entry["text"],
                            "metadata": entry.get("metadata", {}),
                        }
                    )
                logger.info("Loaded %s vector entries from disk.", len(self.index))
            else:
                self.index = []
        except Exception as exc:
            logger.error(f"Failed to load vector index: {exc}")
            self.index = []

    def _save_index(self) -> None:
        try:
            serializable = [
                {
                    "id": entry["id"],
                    "embedding": entry["embedding"].tolist(),
                    "text": entry["text"],
                    "metadata": entry.get("metadata", {}),
                }
                for entry in self.index
            ]
            with self.index_path.open("wb") as fh:
                pickle.dump(serializable, fh)
        except Exception as exc:
            logger.error(f"Failed to persist vector index: {exc}")

    def _initialize_llm(self) -> None:
        try:
            logger.info("Loading seq2seq model: %s", self.llm_model_name)
            self.llm_tokenizer = AutoTokenizer.from_pretrained(self.llm_model_name)
            self.llm_model = AutoModelForSeq2SeqLM.from_pretrained(self.llm_model_name)
            self.llm_model.to(self.device)
            self.llm_model.eval()
            logger.info("LLM initialized successfully on %s", self.device)
        except Exception as exc:
            logger.error(f"Failed to initialize LLM: {exc}")
            self.llm_model = None
            self.llm_tokenizer = None
            # Retrieval will still work; responses will be raw snippets.

    def add_documents(self, texts: List[str], metadatas: List[Dict] = None) -> int:
        if not self.embedding_model:
            raise RuntimeError("Embedding model is not initialized.")

        try:
            documents: List[str] = []
            metadata_list: List[Dict] = []
            ids: List[str] = []

            for index, text in enumerate(texts):
                base_metadata = (
                    metadatas[index].copy()
                    if metadatas and index < len(metadatas)
                    else {}
                )
                chunks = self._chunk_text(text)
                record_id = base_metadata.get("record_id", str(uuid.uuid4()))

                for chunk_index, chunk in enumerate(chunks):
                    if not chunk.strip():
                        continue
                    chunk_metadata = base_metadata.copy()
                    chunk_metadata.update({"chunk_index": chunk_index})
                    doc_id = f"{record_id}-{chunk_index}-{uuid.uuid4().hex[:8]}"
                    metadata_list.append(chunk_metadata)
                    ids.append(doc_id)
                    documents.append(chunk)

            if not documents:
                return 0

            embeddings = self.embedding_model.encode(
                documents, normalize_embeddings=True
            )

            for doc_id, doc_text, doc_meta, emb in zip(ids, documents, metadata_list, embeddings):
                self.index.append(
                    {
                        "id": doc_id,
                        "text": doc_text,
                        "metadata": doc_meta,
                        "embedding": np.asarray(emb, dtype=np.float32),
                    }
                )

            self._save_index()

            logger.info("Added %s chunks to vector store", len(documents))
            return len(documents)

        except Exception as exc:
            logger.error(f"Failed to add documents: {exc}")
            raise

    def query(self, question: str) -> Dict:
        try:
            if not self.embedding_model:
                raise RuntimeError("Embedding model not initialized")

            if not self.index:
                return {
                    "answer": "No relevant information found in the records.",
                    "sources": [],
                    "confidence": 0
                }

            query_vec = self.embedding_model.encode(
                [question], normalize_embeddings=True
            )[0]

            scored_entries = []
            for entry in self.index:
                score = float(np.dot(query_vec, entry["embedding"]))
                scored_entries.append((score, entry))

            scored_entries.sort(key=lambda item: item[0], reverse=True)
            top_entries = scored_entries[:3]

            if not top_entries:
                return {
                    "answer": "No relevant information found in the records.",
                    "sources": [],
                    "confidence": 0
                }

            documents = [entry["text"] for _, entry in top_entries]
            metadatas = [entry["metadata"] for _, entry in top_entries]
            similarities = [score for score, _ in top_entries]

            context = "\n\n".join(documents)
            answer = self._generate_answer(question, context)

            sources = []
            for doc_text, meta in zip(documents, metadatas):
                meta = meta or {}
                sources.append({
                    "record_id": meta.get("record_id", "unknown"),
                    "filename": meta.get("filename", "unknown"),
                    "snippet": doc_text[:200] + ("..." if len(doc_text) > 200 else ""),
                })

            confidence = round(sum(similarities) / len(similarities), 3)

            return {
                "answer": answer,
                "sources": sources,
                "context": context[:500] + "..." if len(context) > 500 else context,
                "confidence": confidence
            }

        except Exception as exc:
            logger.error(f"Query failed: {exc}")
            raise

    def _generate_answer(self, question: str, context: str) -> str:
        if not context.strip():
            return "I could not find information related to your question in the stored records."

        if not self.llm_model or not self.llm_tokenizer:
            logger.warning("LLM not available, returning raw context snippet.")
            return context[:350] + ("..." if len(context) > 350 else "")

        prompt = (
            "You are a village records assistant. Use the context to answer the question briefly.\n"
            f"Context:\n{context}\n\nQuestion: {question}\nAnswer:"
        )

        try:
            inputs = self.llm_tokenizer(
                prompt,
                return_tensors="pt",
                truncation=True,
                max_length=512,
            ).to(self.device)

            with torch.no_grad():
                outputs = self.llm_model.generate(
                    **inputs,
                    max_new_tokens=160,
                    temperature=0.2,
                    top_p=0.9,
                    do_sample=True,
                    no_repeat_ngram_size=3,
                )

            answer = self.llm_tokenizer.decode(
                outputs[0], skip_special_tokens=True
            ).strip()

            if not answer:
                return "I could not generate an answer from the available records."

            return answer
        except Exception as exc:  # pragma: no cover
            logger.error(f"LLM generation failed: {exc}")
            return context[:350] + ("..." if len(context) > 350 else "")

    def get_stats(self) -> Dict:
        try:
            count = len(self.index)
            return {
                "total_chunks": count,
                "collection_name": "village_records",
                "embedding_model": "all-MiniLM-L6-v2"
            }
        except Exception as exc:
            logger.error(f"Failed to get stats: {exc}")
            return {"error": str(exc)}

    @staticmethod
    def _chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
        if chunk_size <= overlap:
            overlap = 0

        chunks: List[str] = []
        start = 0
        length = len(text)

        while start < length:
            end = min(length, start + chunk_size)
            chunk = text[start:end]
            if chunk:
                chunks.append(chunk)
            if end >= length:
                break
            start = max(0, end - overlap)

        return chunks
