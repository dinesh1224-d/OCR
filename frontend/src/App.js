import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@/App.css";
import HomePage from "@/pages/HomePage";
import RecordsPage from "@/pages/RecordsPage";
import QueryPage from "@/pages/QueryPage";
import Layout from "@/components/Layout";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <div className="App">
      <Toaster position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="records" element={<RecordsPage />} />
            <Route path="query" element={<QueryPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
