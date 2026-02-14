// Search input with autocomplete hint component
import type { SearchEngine } from '../search';
import type { PDFIndexer } from '../indexing';

/**
 * Search input component with autocomplete hint.
 */
export class SearchInput {
    private wrapper: HTMLDivElement;
    private input: HTMLInputElement;
    private hint: HTMLSpanElement;
    private onSearch: (query: string) => void;
    private onFocus: () => void;

    private searchEngine: SearchEngine;
    private indexer: PDFIndexer;

    public constructor(
        searchEngine: SearchEngine,
        indexer: PDFIndexer,
        onSearch: (query: string) => void,
        onFocus: () => void
    ) {
        this.searchEngine = searchEngine;
        this.indexer = indexer;
        this.onSearch = onSearch;
        this.onFocus = onFocus;

        // Create wrapper
        this.wrapper = (
            <div style={{ display: 'flex', position: 'relative', width: '200px' }} />
        ) as HTMLDivElement;

        // Create input
        this.input = (
            <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Search PDFs..."
                style={{
                    position: 'absolute',
                    width: '100%',
                    zIndex: 2,
                    backgroundColor: 'transparent'
                }}
            />
        ) as HTMLInputElement;

        // Create hint
        this.hint = (
            <span
                style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    left: '12px',
                    color: '#999',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    fontSize: 'inherit',
                    fontFamily: 'inherit',
                    zIndex: 1
                }}
            />
        ) as HTMLSpanElement;

        this.wrapper.appendChild(this.hint);
        this.wrapper.appendChild(this.input);

        this.attachEventListeners();
    }

    private attachEventListeners(): void {
        this.input.addEventListener('focus', () => this.onFocus());
        
        this.input.addEventListener('input', e => {
            const query = (e.target as HTMLInputElement).value;
            
            // Update hint position based on input text width
            const tempSpan = document.createElement('span');
            tempSpan.style.visibility = 'hidden';
            tempSpan.style.position = 'absolute';
            tempSpan.style.font = window.getComputedStyle(this.input).font;
            tempSpan.textContent = query;
            document.body.appendChild(tempSpan);
            const textWidth = tempSpan.offsetWidth;
            document.body.removeChild(tempSpan);
            
            this.hint.style.left = `${12 + textWidth}px`;
            
            this.updateHint(query);
            this.onSearch(query);
        });
        
        // Accept hint on Tab key
        this.input.addEventListener('keydown', e => {
            if (e.key === 'Tab' && this.hint.textContent) {
                e.preventDefault();
                this.input.value = this.input.value + this.hint.textContent;
                this.onSearch(this.input.value);
            }
        });
    }

    /**
     * Update autocomplete hint.
     * @param query - Current query
     */
    private updateHint(query: string): void {
        if (!query) {
            this.hint.textContent = '';
            return;
        }

        const results = this.searchEngine.search(query);
        if (results.length === 0) {
            this.hint.textContent = '';
            return;
        }

        const indexedPages = this.indexer.getIndexedPages();
        const topResult = indexedPages.get(results[0]);
        if (!topResult) return;

        const queryLower = query.toLowerCase();
        const resultText = topResult.text;
        const resultLower = resultText.toLowerCase();
        
        // Find where the query appears in the result
        const matchIndex = resultLower.indexOf(queryLower);
        if (matchIndex === -1) {
            this.hint.textContent = '';
            return;
        }

        // Get text after the match (the completion part only)
        const afterMatch = resultText.substring(matchIndex + query.length);
        
        // Extract the next word or part of word as completion
        const nextWordMatch = /^(\S+)/.exec(afterMatch);
        if (nextWordMatch) {
            const completion = nextWordMatch[1];
            // Show only the completion part that extends what user typed
            this.hint.textContent = completion;
        } else {
            this.hint.textContent = '';
        }
    }

    public getElement(): HTMLDivElement {
        return this.wrapper;
    }

    public getValue(): string {
        return this.input.value;
    }
}
