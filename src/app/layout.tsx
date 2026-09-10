import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GraphKeeper — Git for Knowledge Graphs",
  description:
    "A visual, collaborative governance and review layer over knowledge graphs: propose, review, approve, and audit every relationship.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full">{children}</body>
    </html>
  );
}