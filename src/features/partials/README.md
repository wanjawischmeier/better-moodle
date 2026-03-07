# TODO's

## Initial demo
- [x] Fix spinnner padding top
- [x] Scroll to top on swap
- [x] Matching urls for caching
- [x] Ignore trailing slashes when matching
- [x] Fix bettermoodle action buttons
- [x] Hierarchical partials
- [x] Caching on/off
- [x] id-specific selectors
- [x] Bug: only include border styles in nav bar active
- [x] Fix white loading screen on nested iframe
- [x] Remove url pinning logic
- [x] mark iframes with a class (to not accidentally remove iframes from smth else)
- [x] Fix: Hide spinner immediately to avoid glitch during fade out
- [x] Split up handler
- [x] Bug: Identify loading elements with class names and always remove fade them all out
- [x] Fix header selection
  - [ ] Doesnt update on navigate back
- [ ] Test interactive iframe elements
- [ ] Bug: sometimes triggers swap with href='#' (when in nested iframe)
- [ ] Bug: Iframe height not always updating
- [ ] Redirect on main window if link in iframe doesnt match any partial
- [ ] Bug: Load hangs when going from Kurs -> Teilnehmer -> Kurs
- [ ] TIMEOUT! for: Loading "..." in new iframe…
- [ ] Propagate on bg clicks through all frames to fix nav bar collapse
- [ ] Partial fragment css patching
- [ ] Bug: Cancelled partial swap not working
- [ ] Bug: Update nav bar selection on navigate back
- [ ] Bug: Not always matching outermost?
  - https://moodle.uni-luebeck.de/user/index.php?id=11492 -> https://moodle.uni-luebeck.de/mod/forum/view.php?id=544292 -> IFIS-WiSe25-DB

## Refactor
- [ ] Move isolation ignore class list to central definition

## Final
- [ ] Adress circular back navigation
- [ ] Close sidebar drawer on mobile automatically on click
- [x] Bug: "Änderungen in Einstellungen angewendet" in iframes nicht zeigen

## Future versions
- [ ] Partial caching
  - [ ] Limitied number of cached partials
- [ ] Side drawer staying visible?
- [ ] Not applying dark mode in nested iframes immediately, only after applying settings