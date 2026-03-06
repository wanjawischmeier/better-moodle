# TODO's

## Initial demo
- [x] Fix spinnner padding top
- [x] Scroll to top on swap
- [x] Matching urls for caching
- [x] Ignore trailing slashes when matching
- [x] Fix bettermoodle action buttons
- [ ] Test interactive iframe elements
- [x] Fix header selection
  - [ ] Doesnt update on navigate back
- [x] Hierarchical partials
- [x] Caching on/off
- [x] id-specific selectors
- [ ] Bug: sometimes triggers swap with href='#' (when in nested iframe)
- [ ] Bug: Iframe height not always updating
- [x] Bug: only include border styles in nav bar active
- [ ] Redirect on main window if link in iframe doesnt match any partial
- [ ] Bug: Load hangs when going from Kurs -> Teilnehmer -> Kurs
- [ ] TIMEOUT! for: Loading "..." in new iframe…
- [x] Fix white loading screen on nested iframe
- [ ] Propagate on bg clicks through all frames to fix nav bar collapse
- [ ] Partial fragment css patching
- [ ] Remove url pinning logic
- [ ] mark iframes with a class (to not accidentally remove iframes from smth else)
- [ ] Fix: Hide spinner immediately to avoid glitch during fade out
- [x] Split up handler

## Refactor
- [ ] Move isolation ignore class list to central definition

## Final
- [ ] Adress circular back navigation
- [ ] Close sidebar drawer on mobile automatically on click
- [ ] Bug: "Änderungen in Einstellungen angewendet" in iframes nicht zeigen

## Future versions
- [ ] Partial caching
  - [ ] Limitied number of cached partials