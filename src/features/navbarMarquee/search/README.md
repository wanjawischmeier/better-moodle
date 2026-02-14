# TODO

## Features

### For basic demo

- [x] clear searchbar when clicked off
- [x] move searchbar icon into search bar
- [x] setting to ignore pdf's over n pages
- [ ] Show query matching filters at top of search results
    - [ ] pressing enter applies that filter
    - [ ] Show active filters on top of dropdown, else "all"
    - [ ] also show filters when no query
- [ ] Make search non-pdf specific
    - [ ] Index html pages as well
    - [ ] show document type in search results
- [ ] Add crawl progress bar
- [ ] Automatic crawling
    - [ ] Get list of courses from my courses dropdown cache (shortname and url)
    - [ ] build dict of files and place in cache
        - Course
            - shortname
            - url
            - lastIndexed (timestamp)
        - Document
            - name
            - url
    - [ ] Build logic for index update: "Crawl all courses and detect changes, index new files, check for changes in existing ones (propably only for html) and delete removed ones from index"
    - [ ] Update index when loading the page and noticing last update more than 24 hours ago
    - [ ] Automatically delete old pages when adding new ones to keep local storage usage below a cap

### For full release

- [ ] Add course specific delete
- [ ] Esc to defocus
- [ ] Proper menu in settings
    - [ ] Enable/Disable
    - [ ] Ignore pdf over n Pages
- [ ] Use i18n
- [ ] Figure out what's going on with tailwind?
- [ ] Enter to open first search result

## Bugs

### For basic demo

- [ ] Autocomplete tab/rarrow
    - [ ] Need to jump to end of query on tab
    - [ ] Should replace entire word with query match to fix capitalization
- [x] Fix userscript being loaded twice!!!
- [x] Fix hint being shown on top of typed text in search bar
- [ ] "Search in all courses" only show when not all courses are selected

### For full release

- [ ] Filter out invalid characters in search results
- [ ] i18n not working for settings title/desc
- [ ] Fix clicking elsewhere in navbar not always closing search dropdown
- [ ] Syntax error for query "Bäume a)"
      Uncaught SyntaxError: Invalid regular expression: /(a))/gi: Unmatched ')' (at userscript.html?name=%25F0%259F%258E%2593%25EF%25B8%258F-UzL%253A-better-moodle.user.js&id=ae3cdcbe-ba08-435e-883c-a6dbd52bfae7:44866:27)
      at new RegExp (<anonymous>)
      at ResultsList.highlightMatches (userscript.html?name=%25F0%259F%258E%2593%25EF%25B8%258F-UzL%253A-better-moodle.user.js&id=ae3cdcbe-ba08-435e-883c-a6dbd52bfae7:44866:27)
      at ResultsList.render (userscript.html?name=%25F0%259F%258E%2593%25EF%25B8%258F-UzL%253A-better-moodle.user.js&id=ae3cdcbe-ba08-435e-883c-a6dbd52bfae7:44918:45)
      at SearchUI.performSearch (userscript.html?name=%25F0%259F%258E%2593%25EF%25B8%258F-UzL%253A-better-moodle.user.js&id=ae3cdcbe-ba08-435e-883c-a6dbd52bfae7:45170:30)
      at SearchInput.onSearch (userscript.html?name=%25F0%259F%258E%2593%25EF%25B8%258F-UzL%253A-better-moodle.user.js&id=ae3cdcbe-ba08-435e-883c-a6dbd52bfae7:45191:27)
      at HTMLInputElement.<anonymous> (userscript.html?name=%25F0%259F%258E%2593%25EF%25B8%258F-UzL%253A-better-moodle.user.js&id=ae3cdcbe-ba08-435e-883c-a6dbd52bfae7:44788:20)
