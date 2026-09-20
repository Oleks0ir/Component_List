// Which component rows a given admin view shows. Kept out of App.jsx so it can be
// checked by test_views.js without React or a bundler.
export const visibleRows = (components, view, lowThreshold, filterZeroStock) =>
  view === 'suggested'
    ? []
    : components.filter((c) => {
        if (view === 'out') return c.in_stock === 0
        if (view === 'low') return c.in_stock > 0 && c.in_stock <= lowThreshold
        return filterZeroStock || c.in_stock > 0
      })
