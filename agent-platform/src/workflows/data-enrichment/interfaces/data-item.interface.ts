export interface DataItem {
  id: string;
  title: string;
  content: string;
  category?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}
