"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <FileText className="h-5 w-5" />
          <span>PDF Reader</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
