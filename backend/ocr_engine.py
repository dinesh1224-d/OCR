import os
import shutil
import pytesseract
import logging
import numpy as np
from typing import Optional, Dict
from PIL import Image  # noqa: F401 (kept for potential future use)
import io  # noqa: F401
from deep_translator import GoogleTranslator
from langdetect import detect, LangDetectException

cv2_import_error: Optional[Exception] = None
try:
    import cv2  # type: ignore
except ImportError as e:  # pragma: no cover
    cv2 = None  # type: ignore
    cv2_import_error = e

logger = logging.getLogger(__name__)

def _resolve_tesseract_path() -> str:
    """
    Find a usable tesseract executable.
    Preference order:
      1. TESSERACT_PATH environment variable
      2. Common Windows install locations
      3. Whatever is on the PATH (shutil.which)
    """
    env_path = os.getenv("TESSERACT_PATH")
    candidates = []

    if env_path:
        candidates.append(env_path)

    candidates.extend([
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        "tesseract",  # rely on PATH
    ])

    def resolve(path: str) -> Optional[str]:
        if os.path.isfile(path):
            return path
        return shutil.which(path)

    for candidate in candidates:
        resolved = resolve(candidate)
        if resolved:
            return resolved

    raise RuntimeError(
        "Tesseract executable not found. Install Tesseract OCR and/or set "
        "the TESSERACT_PATH environment variable to point to tesseract.exe."
    )

TESSERACT_AVAILABLE = False

try:
    resolved_cmd = _resolve_tesseract_path()
    pytesseract.pytesseract.tesseract_cmd = resolved_cmd
    logger.info(f"Using Tesseract executable at: {resolved_cmd}")
    TESSERACT_AVAILABLE = True
except RuntimeError as e:
    logger.error(str(e))
    TESSERACT_AVAILABLE = False

class OCREngine:
    def __init__(self):
        if not TESSERACT_AVAILABLE:
            raise RuntimeError(
                "Tesseract OCR binary not found. Install Tesseract OCR and/or set "
                "the TESSERACT_PATH environment variable to point to tesseract.exe."
            )
        if cv2 is None:
            dependency_msg = (
                "OpenCV (cv2) is not installed. Install it with "
                "'pip install opencv-python-headless' (or 'opencv-python' on Windows)."
            )
            if cv2_import_error:
                dependency_msg += f" Original error: {cv2_import_error}"
            raise RuntimeError(dependency_msg)
        self.default_translator = GoogleTranslator(source='auto', target='en')
        # Configure Tesseract for multiple languages
        # eng = English, hin = Hindi, tam = Tamil
        self.lang_config = 'eng+hin+tam'
    
    def preprocess_image(self, image_bytes: bytes) -> np.ndarray:
        """Preprocess image for better OCR results"""
        try:
            # Convert bytes to numpy array
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                raise ValueError(
                    "Unable to decode image data. Ensure the uploaded file is a supported image format (e.g. PNG, JPEG)."
                )

            # Convert to grayscale
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # Apply adaptive thresholding
            thresh = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                cv2.THRESH_BINARY, 11, 2
            )
            
            # Noise removal
            denoised = cv2.fastNlMeansDenoising(thresh, None, 10, 7, 21)
            
            # Dilation and erosion to remove small noise
            kernel = np.ones((1, 1), np.uint8)
            processed = cv2.dilate(denoised, kernel, iterations=1)
            processed = cv2.erode(processed, kernel, iterations=1)
            
            return processed
            
        except Exception as e:
            logger.error(f"Image preprocessing failed: {str(e)}")
            raise
    
    def extract_text(self, image_bytes: bytes) -> Dict[str, any]:
        """Extract text from image using OCR"""
        try:
            # Preprocess image
            processed_img = self.preprocess_image(image_bytes)
            
            # Perform OCR with multiple language support
            custom_config = f'--oem 3 --psm 6 -l {self.lang_config}'
            text = pytesseract.image_to_string(processed_img, config=custom_config)
            
            # Get detailed data including confidence
            data = pytesseract.image_to_data(processed_img, config=custom_config, output_type=pytesseract.Output.DICT)
            
            # Calculate average confidence
            confidences = [int(conf) for conf in data['conf'] if conf != '-1']
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0
            
            # Clean text
            cleaned_text = self.clean_text(text)
            
            return {
                "raw_text": text,
                "cleaned_text": cleaned_text,
                "confidence": round(avg_confidence, 2),
                "word_count": len(cleaned_text.split())
            }
            
        except Exception as e:
            logger.error(f"OCR extraction failed: {str(e)}")
            raise
    
    def clean_text(self, text: str) -> str:
        """Clean and format OCR text"""
        # Remove extra whitespace
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        cleaned = ' '.join(lines)
        
        # Remove multiple spaces
        cleaned = ' '.join(cleaned.split())
        
        return cleaned
    
    def translate_to_english(self, text: str, source_lang: str = 'auto') -> str:
        """Translate text to English"""
        try:
            if source_lang == 'auto':
                translator = self.default_translator
            else:
                translator = GoogleTranslator(source=source_lang, target='en')
            return translator.translate(text)
        except Exception as e:
            logger.error(f"Translation failed: {str(e)}")
            return text  # Return original if translation fails
    
    def detect_language(self, text: str) -> str:
        """Detect the language of the text"""
        try:
            if not text or not text.strip():
                return 'unknown'
            return detect(text)
        except LangDetectException as e:
            logger.error(f"Language detection failed: {str(e)}")
            return 'unknown'
        except Exception as e:
            logger.error(f"Language detection failed: {str(e)}")
            return 'unknown'
