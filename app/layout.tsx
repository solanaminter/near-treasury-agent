import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Treasury Agent — NEAR Hackathon",
  description:
    "Approval-gated autonomous procurement treasury on NEAR testnet.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
