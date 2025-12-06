export const getBackendUrl = () => {
  if (typeof window !== "undefined") {
    const { hostname, origin } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return "http://localhost:8010";
    }

    const envUrl = (process.env.REACT_APP_BACKEND_URL || "").trim();
    if (envUrl) {
      return envUrl.replace(/\/$/, "");
    }

    return origin.replace(/\/$/, "");
  }

  return (process.env.REACT_APP_BACKEND_URL || "http://localhost:8010").replace(/\/$/, "");
};

export const BACKEND_URL = getBackendUrl();
export const API_BASE_URL = `${BACKEND_URL}/api`;

