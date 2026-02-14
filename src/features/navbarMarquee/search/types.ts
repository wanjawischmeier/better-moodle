// Types for PDF search functionality

export interface CourseTag {
    name: string;
    url?: string;
}

export interface IndexedPage {
    id: string; // format: "pdfUrl|pageNum"
    pdfUrl: string;
    pageNum: number;
    text: string;
    tags: CourseTag[];
}

export interface PDFMetadata {
    url: string;
    title: string;
    pageCount: number;
    indexedAt: number;
    tags: CourseTag[];
}

export interface SearchStats {
    totalDocs: number;
    totalPages: number;
    indexSize: number;
    lastQueryTime: number;
}
