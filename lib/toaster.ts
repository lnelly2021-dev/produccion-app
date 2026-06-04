import { toast as sonnerToast } from "sonner";

export function toast(type: "success" | "error" | "warning" | "info", title: string, description?: string) {
  sonnerToast[type](title, { description });
}
