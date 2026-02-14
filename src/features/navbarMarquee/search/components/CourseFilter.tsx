// Course filter component
import type { SearchEngine } from '../search';

/**
 * Course filter component for filtering by tags.
 */
export class CourseFilter {
    private container: HTMLDivElement;
    private searchEngine: SearchEngine;
    private activeTags: Set<string>;
    private onChange: () => void;

    public constructor(
        searchEngine: SearchEngine,
        activeTags: Set<string>,
        onChange: () => void
    ) {
        this.searchEngine = searchEngine;
        this.activeTags = activeTags;
        this.onChange = onChange;

        this.container = (
            <div className="border-top pt-2 mt-2" style={{ display: 'none' }} />
        ) as HTMLDivElement;
    }

    /**
     * Update the filter UI.
     */
    public update(): void {
        console.log('[PDF Search] Updating filter UI');

        const allTags = this.searchEngine.getAllTags();
        console.log(
            `[PDF Search] Got ${allTags.length} tags from search engine`
        );

        if (allTags.length === 0) {
            this.container.style.display = 'none';
            return;
        }

        // Auto-select current course tag if on a course page
        const currentUrl = window.location.href;
        const matchingTag = allTags.find(
            tag => tag.url && currentUrl.includes(tag.url)
        );
        if (matchingTag && this.activeTags.size === 0) {
            this.activeTags.add(matchingTag.name);
            this.searchEngine.setActiveTags(this.activeTags);
            console.log(
                `[PDF Search] Auto-selected current course tag: ${matchingTag.name}`
            );
        }

        this.container.style.display = 'block';
        this.container.innerHTML =
            '<small class="text-muted d-block mb-1"><strong>Filter by course:</strong></small>';

        const checkboxContainer = (
            <div
                className="d-flex flex-column"
                style={{ maxHeight: '150px', overflowY: 'auto' }}
            />
        );

        for (const tag of allTags) {
            const label = (
                <label
                    className="d-flex align-items-center mb-1"
                    style={{ cursor: 'pointer' }}
                >
                    <input
                        type="checkbox"
                        className="mr-1"
                        checked={
                            this.activeTags.size === 0 ||
                            this.activeTags.has(tag.name)
                        }
                    />
                    <small>{tag.name}</small>
                </label>
            ) as HTMLLabelElement;

            const checkbox = label.querySelector('input')!;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.activeTags.add(tag.name);
                } else {
                    this.activeTags.delete(tag.name);
                }

                this.searchEngine.setActiveTags(this.activeTags);
                this.onChange();
            });

            checkboxContainer.appendChild(label);
        }

        // Add "Select All" helper
        if (allTags.length > 1) {
            const selectAllBtn = (
                <button
                    className="btn btn-sm btn-link p-0 mt-1"
                    style={{ fontSize: '0.75rem' }}
                >
                    {(
                        this.activeTags.size === 0 ||
                        this.activeTags.size === allTags.length
                    ) ?
                        'Deselect All'
                    :   'Select All'}
                </button>
            ) as HTMLButtonElement;

            selectAllBtn.addEventListener('click', () => {
                const shouldSelectAll = this.activeTags.size !== allTags.length;

                if (shouldSelectAll) {
                    this.activeTags.clear();
                    for (const tag of allTags) {
                        this.activeTags.add(tag.name);
                    }
                    selectAllBtn.textContent = 'Deselect All';
                } else {
                    this.activeTags.clear();
                    selectAllBtn.textContent = 'Select All';
                }

                // Update all checkboxes
                checkboxContainer
                    .querySelectorAll<HTMLInputElement>(
                        'input[type="checkbox"]'
                    )
                    .forEach(cb => {
                        cb.checked = shouldSelectAll;
                    });

                this.searchEngine.setActiveTags(this.activeTags);
                this.onChange();
            });

            this.container.appendChild(selectAllBtn);
        }

        this.container.appendChild(checkboxContainer);
    }

    public getElement(): HTMLDivElement {
        return this.container;
    }

    public getActiveTags(): Set<string> {
        return this.activeTags;
    }
}
