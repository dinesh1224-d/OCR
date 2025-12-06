import { useState, useEffect } from "react";
import { FileText, Calendar, Languages, TrendingUp, Loader2, Search, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import axios from "axios";
import { BACKEND_URL, API_BASE_URL } from "@/lib/apiConfig";

if (process.env.NODE_ENV === "development") {
  console.log("Backend URL:", BACKEND_URL);
  console.log("API Base URL:", API_BASE_URL);
}

// Log backend URL for debugging
const RecordsPage = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/records`);
      setRecords(response.data);
    } catch (error) {
      console.error('Failed to fetch records:', error);

      if (error.response?.status === 503) {
        const detail =
          error.response.data?.detail ||
          `Backend database is not reachable. Ensure MongoDB is running for ${BACKEND_URL}.`;
        toast.error(detail);
      } else if (error.code === 'ERR_NETWORK') {
        toast.error(`Cannot reach backend at ${BACKEND_URL}.`);
      } else {
        toast.error("Failed to load records");
      }

      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const deleteAllRecords = async () => {
    if (!window.confirm('Are you sure you want to delete all records? This action cannot be undone.')) {
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/records`);
      toast.success("All records deleted");
      setRecords([]);
      setSelectedRecord(null);
    } catch (error) {
      console.error('Failed to delete records:', error);
      toast.error("Failed to delete records");
    }
  };

  const filteredRecords = records.filter((record) =>
    record.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
    record.cleaned_text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getLanguageLabel = (lang) => {
    const labels = {
      'en': 'English',
      'hi': 'Hindi',
      'ta': 'Tamil'
    };
    return labels[lang] || lang;
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-2">
              Document Records
            </h1>
            <p className="text-base sm:text-lg text-slate-600">
              View and manage all processed village documents
            </p>
          </div>
          {records.length > 0 && (
            <Button
              variant="destructive"
              onClick={deleteAllRecords}
              className="flex items-center space-x-2"
              data-testid="delete-all-button"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete All</span>
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20" data-testid="loading-indicator">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <Card className="glass-card border-0" data-testid="no-records-message">
          <CardContent className="py-20 text-center">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-lg text-slate-500 mb-2">No records found</p>
            <p className="text-sm text-slate-400">Upload documents to see them here</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Records List */}
          <div className="lg:col-span-1 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Search records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 glass-card border-0"
                data-testid="search-input"
              />
            </div>

            {/* Record Cards */}
            <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto pr-2">
              {filteredRecords.map((record) => (
                <Card
                  key={record.id}
                  className={`glass-card border-0 cursor-pointer card-hover ${
                    selectedRecord?.id === record.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                  onClick={() => setSelectedRecord(record)}
                  data-testid={`record-card-${record.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 truncate">
                          {record.filename}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {formatDate(record.processed_at)}
                        </p>
                        <div className="flex items-center space-x-2 mt-2">
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                            {record.confidence}%
                          </span>
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                            {getLanguageLabel(record.language)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Record Detail */}
          <div className="lg:col-span-2">
            {selectedRecord ? (
              <Card className="glass-card border-0 animate-fade-in" data-testid="record-detail">
                <CardHeader>
                  <CardTitle className="text-2xl">{selectedRecord.filename}</CardTitle>
                  <CardDescription>
                    Processed on {formatDate(selectedRecord.processed_at)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Metadata */}
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-blue-600" />
                        <p className="text-sm text-blue-600 font-medium">Confidence</p>
                      </div>
                      <p className="text-2xl font-bold text-blue-900">
                        {selectedRecord.confidence}%
                      </p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <FileText className="w-4 h-4 text-green-600" />
                        <p className="text-sm text-green-600 font-medium">Word Count</p>
                      </div>
                      <p className="text-2xl font-bold text-green-900">
                        {selectedRecord.word_count}
                      </p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Languages className="w-4 h-4 text-purple-600" />
                        <p className="text-sm text-purple-600 font-medium">Language</p>
                      </div>
                      <p className="text-lg font-bold text-purple-900">
                        {getLanguageLabel(selectedRecord.language)}
                      </p>
                    </div>
                  </div>

                  {/* Full Text */}
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-3">Extracted Text</h3>
                    <div className="bg-slate-50 rounded-lg p-6 max-h-96 overflow-y-auto">
                      <p className="text-sm text-slate-800 whitespace-pre-wrap" data-testid="full-extracted-text">
                        {selectedRecord.cleaned_text || 'No text extracted'}
                      </p>
                    </div>
                  </div>

                  {/* Record Info */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-xs text-slate-600 font-medium mb-2">Record Information</p>
                    <div className="space-y-1 text-xs text-slate-700">
                      <p><span className="font-medium">ID:</span> {selectedRecord.id}</p>
                      <p><span className="font-medium">File Type:</span> {selectedRecord.file_type}</p>
                      <p><span className="font-medium">Status:</span> <span className="text-green-600">{selectedRecord.status}</span></p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="glass-card border-0" data-testid="no-selection-message">
                <CardContent className="py-20 text-center">
                  <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-lg text-slate-500 mb-2">Select a record</p>
                  <p className="text-sm text-slate-400">Click on a record to view details</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecordsPage;
