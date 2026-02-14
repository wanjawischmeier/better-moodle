// Search input with autocomplete hint component
import type { SearchEngine } from '../search';
import type { PDFIndexer } from '../indexing';

/**
 * Search input component with autocomplete hint.
 */
export class SearchInput {
    private container: HTMLDivElement;
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

        // Create container with input-like styling
        this.container = (
            <div 
                className="form-control form-control-sm p-0"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '200px',
                    position: 'relative',
                    overflow: 'hidden'
                }}
            />
        ) as HTMLDivElement;

        // Add search icon wrapper
        const iconWrapper = (
            <div data-region="navbar-icon" className="ml-2" style="background-color: white; z-index: 1000;">
                <i 
                    className="icon fa fa-search" 
                    title="Search"
                    role="img"
                    aria-label="Search"
                />
            </div>
        );
        this.container.appendChild(iconWrapper);

        // Create text container (holds input + hint)
        const textContainer = (
            <div style={{ 
                position: 'relative', 
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center'
            }} />
        ) as HTMLDivElement;

        // Create hint (behind input)
        this.hint = (
            <span
                style={{
                    position: 'absolute',
                    left: 0,
                    color: '#999',
                    pointerEvents: 'none',
                    whiteSpace: 'pre',
                    userSelect: 'none'
                }}
            />
        ) as HTMLSpanElement;

        // Create input (transparent background, no border)
        this.input = (
            <input
                type="text"
                placeholder="Search..."
                style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    padding: 0,
                    margin: 0,
                    width: '100%',
                    zIndex: 10
                }}
            />
        ) as HTMLInputElement;

        textContainer.appendChild(this.hint);
        textContainer.appendChild(this.input);
        this.container.appendChild(textContainer);

        this.attachEventListeners();
    }

    private attachEventListeners(): void {
        this.input.addEventListener('focus', () => this.onFocus());
        
        this.input.addEventListener('input', () => {
            const query = this.input.value;
            this.updateHint(query);
            this.onSearch(query);
        });

        this.input.addEventListener('scroll', () => {
            // Sync hint scroll with input scroll
            this.hint.style.transform = `translateX(-${this.input.scrollLeft}px)`;
        });
        
        // Accept hint on Tab or Right Arrow at end of input
        this.input.addEventListener('keydown', e => {
            const atEnd = this.input.selectionStart === this.input.value.length;
            
            if ((e.key === 'Tab' || (e.key === 'ArrowRight' && atEnd)) && this.hint.textContent) {
                e.preventDefault();
                const currentValue = this.input.value;
                const completion = this.hint.textContent.substring(currentValue.length);
                this.input.value = currentValue + completion;
                this.updateHint(this.input.value);
                this.onSearch(this.input.value);
            }
        });

        // Add focus styling to container
        this.input.addEventListener('focus', () => {
            this.container.style.borderColor = '#80bdff';
            this.container.style.boxShadow = '0 0 0 0.2rem rgba(0, 123, 255, 0.25)';
        });

        this.input.addEventListener('blur', () => {
            this.container.style.borderColor = '';
            this.container.style.boxShadow = '';
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
        if (!topResult) {
            this.hint.textContent = '';
            return;
        }

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
            // Show query + completion (hint shows full text, input covers first part)
            this.hint.textContent = query + completion;
            
            // Sync scroll position
            this.hint.style.transform = `translateX(-${this.input.scrollLeft}px)`;
        } else {
            this.hint.textContent = '';
        }
    }

    public getElement(): HTMLDivElement {
        return this.container;
    }

    public getValue(): string {
        return this.input.value;
    }
}
