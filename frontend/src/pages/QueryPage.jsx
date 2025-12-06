import { useState, useEffect, useRef } from "react";
import { Send, Search, Loader2, Bot, User, Database, AlertCircle } from "lucide-react";
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
const QueryPage = () => {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: query,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setQuery("");
    setLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/query`, {
        question: query
      });

      const botMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: response.data.answer,
        sources: response.data.sources,
        confidence: response.data.confidence,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Query failed:', error);
      toast.error(error.response?.data?.detail || "Failed to process query");
      
      const errorMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: 'Sorry, I encountered an error processing your query. Please try again.',
        error: true,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const suggestedQueries = [
    "Who owns land plot 45?",
    "Show me records from 2020",
    "What are the recent sanctions?",
    "List all property owners"
  ];

  const handleSuggestedQuery = (suggestedQuery) => {
    setQuery(suggestedQuery);
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-2">
          Query Records
        </h1>
        <p className="text-base sm:text-lg text-slate-600">
          Ask questions about your village documents using natural language
        </p>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Stats Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="glass-card border-0" data-testid="stats-card">
            <CardHeader>
              <CardTitle className="text-lg">System Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats ? (
                <>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Database className="w-4 h-4 text-blue-600" />
                      <p className="text-xs text-blue-600 font-medium">Total Records</p>
                    </div>
                    <p className="text-2xl font-bold text-blue-900">
                      {stats.total_records}
                    </p>
                  </div>
                  
                  {stats.rag_stats?.total_chunks && (
                    <div className="bg-purple-50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Search className="w-4 h-4 text-purple-600" />
                        <p className="text-xs text-purple-600 font-medium">Searchable Chunks</p>
                      </div>
                      <p className="text-2xl font-bold text-purple-900">
                        {stats.rag_stats.total_chunks}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">OCR</span>
                      <span className={stats.ocr_enabled ? 'text-green-600' : 'text-red-600'}>
                        {stats.ocr_enabled ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">RAG</span>
                      <span className={stats.rag_enabled ? 'text-green-600' : 'text-red-600'}>
                        {stats.rag_enabled ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <Loader2 className="w-8 h-8 text-slate-300 animate-spin mx-auto" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Suggested Queries */}
          <Card className="glass-card border-0" data-testid="suggestions-card">
            <CardHeader>
              <CardTitle className="text-lg">Suggested Queries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {suggestedQueries.map((sq, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestedQuery(sq)}
                  className="w-full text-left text-sm text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg p-3 transition-colors"
                  data-testid={`suggestion-${index}`}
                >
                  {sq}
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Chat Interface */}
        <div className="lg:col-span-3">
          <Card className="glass-card border-0 flex flex-col" style={{ height: 'calc(100vh - 280px)' }} data-testid="chat-card">
            <CardHeader className="border-b border-slate-200">
              <CardTitle className="text-xl flex items-center space-x-2">
                <Bot className="w-6 h-6 text-blue-500" />
                <span>AI Assistant</span>
              </CardTitle>
              <CardDescription>
                Ask questions about your village records in natural language
              </CardDescription>
            </CardHeader>
            
            {/* Messages */}
            <CardContent className="flex-1 overflow-y-auto p-6 space-y-4" data-testid="messages-container">
              {messages.length === 0 ? (
                <div className="text-center py-20">
                  <Search className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-lg text-slate-500 mb-2">No messages yet</p>
                  <p className="text-sm text-slate-400">Start by asking a question about your records</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex items-start space-x-3 animate-fade-in ${
                      message.type === 'user' ? 'justify-end' : ''
                    }`}
                    data-testid={`message-${message.type}`}
                  >
                    {message.type === 'bot' && (
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Bot className="w-5 h-5 text-blue-600" />
                      </div>
                    )}
                    
                    <div
                      className={`max-w-[80%] rounded-xl p-4 ${
                        message.type === 'user'
                          ? 'bg-blue-500 text-white'
                          : message.error
                          ? 'bg-red-50 border border-red-200'
                          : 'bg-slate-50'
                      }`}
                    >
                      <p className={`text-sm whitespace-pre-wrap ${
                        message.type === 'user' ? 'text-white' : 'text-slate-800'
                      }`}>
                        {message.content}
                      </p>
                      
                      {message.sources && message.sources.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-200">
                          <p className="text-xs font-medium text-slate-600 mb-2">Sources:</p>
                          <div className="space-y-2">
                            {message.sources.map((source, idx) => (
                              <div key={idx} className="bg-white rounded-lg p-2 text-xs">
                                <p className="font-medium text-slate-700">{source.filename}</p>
                                <p className="text-slate-500 mt-1">{source.snippet}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <p className="text-xs mt-2 opacity-70">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                    
                    {message.type === 'user' && (
                      <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </div>
                ))
              )}
              
              {loading && (
                <div className="flex items-start space-x-3 animate-fade-in" data-testid="loading-message">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </CardContent>
            
            {/* Input */}
            <div className="border-t border-slate-200 p-4">
              <form onSubmit={handleSubmit} className="flex space-x-2">
                <Input
                  type="text"
                  placeholder="Ask a question about your records..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={loading}
                  className="flex-1"
                  data-testid="query-input"
                />
                <Button
                  type="submit"
                  disabled={loading || !query.trim()}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                  data-testid="send-button"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default QueryPage;
