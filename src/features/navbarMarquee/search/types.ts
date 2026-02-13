// Types for PDF search functionality

export interface IndexedPage {
    id: string; // format: "pdfUrl|pageNum"
    pdfUrl: string;
    pageNum: number;
    text: string;
}

export interface PDFMetadata {
    url: string;
    title: string;
    pageCount: number;
    indexedAt: number;
}

export interface SearchStats {
    totalDocs: number;
    totalPages: number;
    indexSize: number;
    lastQueryTime: number;
}
