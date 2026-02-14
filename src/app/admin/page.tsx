"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Trash2,
  FileText,
  Calendar,
  HardDrive,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Header } from "@/components/header";
import { formatFileSize, formatDate, getDisplayName } from "@/lib/format";
import { toast } from "sonner";
import type { PdfFile } from "@/types";

export default function AdminDashboard() {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Check auth status
  useEffect(() => {
    fetch("/api/auth/check")
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          router.push("/admin/login");
        } else {
          setAuthenticated(true);
          setChecking(false);
        }
      })
      .catch(() => router.push("/admin/login"));
  }, [router]);

  // Fetch files
  useEffect(() => {
    if (!authenticated) return;
    fetchFiles();
  }, [authenticated]);

  async function fetchFiles() {
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      setFiles(data);
    } catch {
      toast.error("Failed to fetch files");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".pdf")) {
      toast.error("Only PDF files are allowed");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/files", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        toast.success("PDF uploaded successfully");
        fetchFiles();
      } else {
        const data = await res.json();
        toast.error(data.error || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleDelete(fileName: string) {
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(fileName)}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("PDF deleted");
        fetchFiles();
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Checking authorization...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Admin Dashboard
            </h1>
            <p className="mt-1 text-muted-foreground">
              Manage your PDF documents
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>

        <Separator className="mb-8" />

        {/* Upload Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-5 w-5" />
              Upload PDF
            </CardTitle>
            <CardDescription>
              Select a PDF file to upload. Max recommended size: 50MB.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="pdf-upload">Choose file</Label>
                <Input
                  id="pdf-upload"
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleUpload}
                  disabled={uploading}
                  className="cursor-pointer"
                />
              </div>
            </div>
            {uploading && (
              <p className="mt-3 text-sm text-muted-foreground animate-pulse">
                Uploading...
              </p>
            )}
          </CardContent>
        </Card>

        {/* Files Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Uploaded Files
              </span>
              <Badge variant="secondary">{files.length} files</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-8 text-center text-muted-foreground animate-pulse">
                Loading files...
              </p>
            ) : files.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No files uploaded yet
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files.map((file) => (
                      <TableRow key={file.id}>
                        <TableCell className="max-w-[300px]">
                          <span className="line-clamp-1 break-all font-medium">
                            {getDisplayName(file.name)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <HardDrive className="h-3 w-3" />
                            {formatFileSize(file.size)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {formatDate(file.created_at, true)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete this PDF?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete &ldquo;
                                  {getDisplayName(file.name)}
                                  &rdquo;. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(file.name)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
