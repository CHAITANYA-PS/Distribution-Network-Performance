/* Dsphere shared interface behavior */
document.querySelectorAll('.global-search').forEach(search => {
  search.addEventListener('input', event => {
    const query = event.target.value.toLowerCase().trim();
    document.querySelectorAll('tbody tr').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
    });
  });
});
