import { toast } from "sonner";

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    // If in browser or WebView over HTTP/HTTPS, relative paths automatically route through Vite proxy on the current host
    if (window.location.protocol.startsWith("http")) {
      return "";
    }
    // If in native Capacitor shell (capacitor://), use configured API URL or LAN host
    return import.meta.env.VITE_API_BASE_URL || "http://10.30.234.158:8000";
  }
  return import.meta.env.VITE_API_BASE_URL || "http://10.30.234.158:8000";
}

interface ApiOptions extends RequestInit {
  data?: any;
  params?: Record<string, string>;
  isMultipart?: boolean;
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, data: any, message: string) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = "ApiError";
  }
}

function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem("findit_auth_token");
  }
  return null;
}

let last429ToastTime = 0;
let lastNetworkErrorToastTime = 0;

function handleApiError(status: number, data: any) {
  switch (status) {
    case 400:
      toast.error(data?.detail || "Bad Request");
      break;
    case 401:
      if (getAuthToken()) {
        localStorage.removeItem("findit_auth_token");
        toast.error("Authentication failed. Please log in again.");
        window.location.href = "/login";
      } else {
        toast.error("Authentication failed.");
      }
      break;
    case 403:
      toast.error(data?.detail || "You are not authorized to perform this action.");
      break;
    case 404:
      toast.error("The requested resource was not found.");
      break;
    case 409:
      toast.error(data?.detail || "This action conflicts with current state (e.g. match already resolved).");
      break;
    case 422:
      if (data?.detail && Array.isArray(data.detail)) {
        const messages = data.detail.map((err: any) => `${err.loc.join(".")} - ${err.msg}`).join(", ");
        toast.error(`Validation Error: ${messages}`);
      } else {
        toast.error(data?.detail || "Validation Error");
      }
      break;
    case 429: {
      const now = Date.now();
      if (now - last429ToastTime > 6000) {
        last429ToastTime = now;
        toast.error("Please slow down a moment.");
      }
      break;
    }
    case 500:
      toast.error("An internal server error occurred. Please try again later.");
      break;
    default:
      if (status >= 400) {
        toast.error(data?.detail || "An unexpected error occurred.");
      }
  }
}

async function request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { data, params, isMultipart, headers: customHeaders, ...customConfig } = options;

  const token = getAuthToken();
  const headers = new Headers(customHeaders);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Set Content-Type to application/json by default unless it's multipart
  if (data && !isMultipart && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const baseUrl = getApiBaseUrl();
  let url = `${baseUrl}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value);
      }
    });
    url += `?${searchParams.toString()}`;
  }

  const config: RequestInit = {
    ...customConfig,
    headers,
  };

  if (data) {
    config.body = (isMultipart || typeof data === 'string' || data instanceof URLSearchParams) ? data : JSON.stringify(data);
  }

  try {
    const response = await fetch(url, config);
    
    // Check if the response is JSON
    const contentType = response.headers.get("content-type");
    const isJson = contentType && contentType.includes("application/json");
    
    let responseData = null;
    if (isJson) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    if (!response.ok) {
      handleApiError(response.status, responseData);
      throw new ApiError(response.status, responseData, responseData?.detail || response.statusText);
    }

    return responseData as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    // Network errors (e.g. server down, CORS issues where JS gets no status)
    const now = Date.now();
    if (now - lastNetworkErrorToastTime > 6000) {
      lastNetworkErrorToastTime = now;
      toast.error("Reconnecting to server...");
    }
    throw new Error("Network error");
  }
}

export const api = {
  get: <T>(endpoint: string, options?: Omit<ApiOptions, "body" | "data">) =>
    request<T>(endpoint, { ...options, method: "GET" }),
    
  post: <T>(endpoint: string, data?: any, options?: Omit<ApiOptions, "body" | "data">) =>
    request<T>(endpoint, { ...options, data, method: "POST" }),
    
  put: <T>(endpoint: string, data?: any, options?: Omit<ApiOptions, "body" | "data">) =>
    request<T>(endpoint, { ...options, data, method: "PUT" }),
    
  patch: <T>(endpoint: string, data?: any, options?: Omit<ApiOptions, "body" | "data">) =>
    request<T>(endpoint, { ...options, data, method: "PATCH" }),
    
  delete: <T>(endpoint: string, options?: Omit<ApiOptions, "body" | "data">) =>
    request<T>(endpoint, { ...options, method: "DELETE" }),
    
  postForm: <T>(endpoint: string, formData: FormData, options?: Omit<ApiOptions, "body" | "data">) =>
    request<T>(endpoint, { ...options, data: formData, method: "POST", isMultipart: true }),
};
