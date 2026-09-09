import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getImageUrl(path?: string | null): string {
  if (!path) return "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22300%22%20viewBox%3D%220%200%20400%20300%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23e2e8f0%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20font-size%3D%2214px%22%20fill%3D%22%2364748b%22%3ENo%20Image%20Available%3C%2Ftext%3E%3C%2Fsvg%3E";
  
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  
  let cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (!cleanPath.startsWith("/uploads/")) {
    cleanPath = `/uploads${cleanPath}`;
  }
  if (typeof window !== "undefined" && window.location.protocol.startsWith("http")) {
    return cleanPath;
  }
  const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://10.30.234.158:8000";
  return `${baseUrl}${cleanPath}`;
}
