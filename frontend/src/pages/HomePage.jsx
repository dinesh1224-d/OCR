import { useState, useEffect, useCallback, useRef } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import axios from "axios";
import { BACKEND_URL, API_BASE_URL } from "@/lib/apiConfig";

// Log backend URL for debugging
if (process.env.NODE_ENV === 'development') {
  console.log('Backend URL:', BACKEND_URL);
  console.log('API Base URL:', API_BASE_URL);
}

const HomePage = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [backendConnected, setBackendConnected] = useState(null); // null = checking, true = connected, false = disconnected
  const [backendError, setBackendError] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const checkBackend = useCallback(async () => {
    const requestUrl = `${API_BASE_URL}/health`;
    try {
      await axios.get(requestUrl, { timeout: 3000, headers: { 'Cache-Control': 'no-cache' } });
      if (!isMountedRef.current) return true;
      setBackendConnected(true);
      setBackendError(null);
      return true;
    } catch (error) {
      if (!isMountedRef.current) return false;

      if (error.response) {
        setBackendConnected(true);
        setBackendError(null);
        return true;
      }

      const fallbackUrls = new Set([requestUrl]);
      try {
        const backendUrl = new URL(BACKEND_URL);
        const port = backendUrl.port || '8010';
        if (backendUrl.hostname === 'localhost' || backendUrl.hostname === '127.0.0.1') {
          fallbackUrls.add(`${backendUrl.protocol}//127.0.0.1:${port}/api/health`);
          fallbackUrls.add(`${backendUrl.protocol}//localhost:${port}/api/health`);
        }
      } catch {
        fallbackUrls.add('http://127.0.0.1:8010/api/health');
      }

      let lastError = error;
      for (const url of fallbackUrls) {
        try {
          await fetch(url, { mode: 'no-cors', cache: 'no-store' });
          if (!isMountedRef.current) return true;
          setBackendConnected(true);
          setBackendError(null);
          return true;
        } catch (fallbackErr) {
          lastError = fallbackErr;
        }
      }

      setBackendConnected(false);
      setBackendError(lastError?.message || error.message || 'Network error');
      console.warn('Backend health check failed:', lastError?.message || error.message);
      return false;
    }
  }, [API_BASE_URL, BACKEND_URL]);

  // Check backend connection on mount
  useEffect(() => {
    let retryTimer = null;

    const attempt = async () => {
      const success = await checkBackend();
      if (!success) {
        retryTimer = setTimeout(attempt, 5000);
      }
    };

    attempt();

    return () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [checkBackend]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.type.startsWith('image/') || droppedFile.type === 'application/pdf')) {
      setFile(droppedFile);
      setResult(null);
    } else {
      toast.error("Please upload an image or PDF file");
    }
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setResult(response.data);
      toast.success("Document processed successfully!");
    } catch (error) {
      // Only log error if it's not a network/CORS issue
      if (error.code !== 'ERR_NETWORK' && error.code !== 'ERR_CANCELED') {
        console.error('Upload error:', error);
      }
      
      // Provide more specific error messages
      let errorMessage = "Failed to process document";
      if (error.response) {
        // Server responded with error
        errorMessage = error.response.data?.detail || error.response.data?.message || `Server error: ${error.response.status}`;
      } else if (error.request || error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED') {
        // Request made but no response - backend is likely not running
        errorMessage = `Cannot connect to backend server at ${BACKEND_URL}. Please make sure the backend server is running on port 8010.`;
        console.error('Backend connection failed:', {
          url: `${API_BASE_URL}/upload`,
          backendUrl: BACKEND_URL,
          error: error.message,
          code: error.code
        });
      } else if (error.code === 'ERR_CANCELED') {
        return; // Don't show error for canceled requests
      } else {
        errorMessage = error.message || "An unexpected error occurred.";
      }
      
      toast.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-6xl">
      {/* Backend Connection Warning */}
      {backendConnected === false && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-900">
                Backend server is not running
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                Please start the backend server on port 8010. See START_BACKEND.md for instructions.
              </p>
              <p className="text-xs text-yellow-600 mt-1 font-mono">
                Backend URL: {BACKEND_URL}
              </p>
              {backendError && (
                <p className="text-xs text-yellow-500 mt-1">
                  Last error: {backendError}
                </p>
              )}
              <button
                type="button"
                className="mt-2 text-xs font-medium text-blue-600 hover:underline"
                onClick={() => {
                  setBackendConnected(null);
                  setBackendError(null);
                  checkBackend();
                }}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Hero Section */}
      <div className="text-center mb-12 animate-fade-in">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 mb-4">
          Digitize Village Records
        </h1>
        <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
          Upload handwritten or scanned documents to extract text in English, Hindi, and Tamil.
          Powered by AI-based OCR and RAG technology.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Upload Section */}
        <Card className="glass-card border-0 animate-slide-in" data-testid="upload-card">
          <CardHeader>
            <CardTitle className="text-2xl">Upload Document</CardTitle>
            <CardDescription>
              Drag & drop or click to upload an image or PDF file
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Drag & Drop Area */}
            <div
              className={`upload-area rounded-xl p-12 text-center cursor-pointer ${
                dragOver ? 'drag-over' : ''
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input').click()}
              data-testid="upload-dropzone"
            >
              <input
                id="file-input"
                type="file"
                className="hidden"
                accept="image/*,application/pdf"
                onChange={handleFileSelect}
                data-testid="file-input"
              />
              {file ? (
                <div className="space-y-4">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{file.name}</p>
                    <p className="text-sm text-slate-600 mt-1">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <Upload className="w-16 h-16 text-slate-400 mx-auto" />
                  <div>
                    <p className="text-lg font-semibold text-slate-900">Drop your file here</p>
                    <p className="text-sm text-slate-600 mt-1">or click to browse</p>
                  </div>
                  <p className="text-xs text-slate-500">Supports: JPG, PNG, PDF</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <Button
                className="flex-1 btn-primary bg-blue-500 hover:bg-blue-600 text-white"
                onClick={handleUpload}
                disabled={!file || uploading}
                data-testid="process-button"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Process Document
                  </>
                )}
              </Button>
              {file && (
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="border-slate-300"
                  data-testid="reset-button"
                >
                  Reset
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Result Section */}
        <Card className="glass-card border-0 animate-slide-in" data-testid="result-card">
          <CardHeader>
            <CardTitle className="text-2xl">Extraction Result</CardTitle>
            <CardDescription>
              OCR results and document metadata
            </CardDescription>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-4" data-testid="result-content">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-sm text-blue-600 font-medium">Confidence</p>
                    <p className="text-2xl font-bold text-blue-900">{result.confidence}%</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-sm text-green-600 font-medium">Words</p>
                    <p className="text-2xl font-bold text-green-900">{result.word_count}</p>
                  </div>
                </div>

                {/* Language */}
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-sm text-purple-600 font-medium mb-2">Detected Language</p>
                  <p className="text-lg font-semibold text-purple-900 capitalize">
                    {result.language === 'en' ? 'English' : 
                     result.language === 'hi' ? 'Hindi' :
                     result.language === 'ta' ? 'Tamil' : result.language}
                  </p>
                </div>

                {/* Text Preview */}
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-sm text-slate-600 font-medium mb-2">Text Preview</p>
                  <div className="bg-white rounded-lg p-4 max-h-64 overflow-y-auto" data-testid="extracted-text">
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">
                      {result.text_preview}
                    </p>
                  </div>
                </div>

                {/* Success Message */}
                <div className="flex items-start space-x-3 bg-green-50 border border-green-200 rounded-lg p-4">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-900">
                      Document processed successfully!
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      Record ID: {result.record_id}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No results yet</p>
                <p className="text-sm text-slate-400 mt-2">Upload a document to see extraction results</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Features */}
      <div className="grid md:grid-cols-3 gap-6 mt-12">
        <div className="glass-card rounded-xl p-6 text-center card-hover">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <FileText className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Multi-language OCR</h3>
          <p className="text-sm text-slate-600">
            Extract text from documents in English, Hindi, and Tamil
          </p>
        </div>
        <div className="glass-card rounded-xl p-6 text-center card-hover">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">High Accuracy</h3>
          <p className="text-sm text-slate-600">
            Advanced image preprocessing for better text recognition
          </p>
        </div>
        <div className="glass-card rounded-xl p-6 text-center card-hover">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Smart Storage</h3>
          <p className="text-sm text-slate-600">
            Records stored in database with vector embeddings for AI search
          </p>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
