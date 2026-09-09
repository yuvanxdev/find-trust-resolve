export type ItemType = "LOST" | "FOUND";

export type ItemCategory = 
  | "ELECTRONICS" 
  | "ACCESSORIES" 
  | "KEYS" 
  | "BAGS" 
  | "DOCUMENTS" 
  | "CLOTHING" 
  | "OTHER";

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  ELECTRONICS: "Electronics",
  ACCESSORIES: "Accessories",
  KEYS: "Keys",
  BAGS: "Bags",
  DOCUMENTS: "ID & Documents",
  CLOTHING: "Clothing",
  OTHER: "Other"
};
