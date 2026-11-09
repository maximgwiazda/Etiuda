/* Settings' section glyphs, so Library and Maintenance draw the same set. Copied rather than
   imported: settings.js already imports Maintenance, and this file has to stay at the bottom. */
const LM_ICONS={
  "general":'<path d="M11.16 6.4L11.37 4.08L13.63 4.08L13.84 6.4L15.87 7.24L17.65 5.74L19.26 7.35L17.76 9.13L18.6 11.16L20.92 11.37L20.92 13.63L18.6 13.84L17.76 15.87L19.26 17.65L17.65 19.26L15.87 17.76L13.84 18.6L13.63 20.92L11.37 20.92L11.16 18.6L9.13 17.76L7.35 19.26L5.74 17.65L7.24 15.87L6.4 13.84L4.08 13.63L4.08 11.37L6.4 11.16L7.24 9.13L5.74 7.35L7.35 5.74L9.13 7.24z"/><circle cx="12.5" cy="12.5" r="2.75"/>',
  "layout":'<rect x="3.5" y="4.5" width="7.5" height="6.5" rx="1.6" fill="currentColor" fill-opacity=".35"/><rect x="13" y="4.5" width="7.5" height="6.5" rx="1.6"/><rect x="3.5" y="13" width="7.5" height="6.5" rx="1.6"/><rect x="13" y="13" width="7.5" height="6.5" rx="1.6"/>',
  "data":'<path d="M4.5 12.5a8 8 0 1 0 8-8c-2.4 0-4.6 1-6.2 2.7L4.5 9M4.5 4.5v4.5h4.5"/><circle cx="10.34" cy="14.66" r="2.6"/><path d="M12.18 12.82L16.5 8.5M15.43 9.57l1.84 1.84M14.09 10.91l1.84 1.84"/>',
  "search":'<circle cx="11" cy="11" r="6.5"/><path d="M15.6 15.6L20.5 20.5"/>',
  "user":'<circle cx="12.5" cy="8.5" r="3.5"/><path d="M5.5 20.5v-1.5a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1.5"/>',
  "intents":'<path d="M4.5 10.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-5l-3 3v-3a2 2 0 0 1-2-2zM9.5 8.5v-2a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>',
  "categories":'<path d="M4.5 18.5h16M6.5 18.5v-7a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v7M13.5 18.5v-11a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v11"/>',
  "cards":'<rect x="4.5" y="9.5" width="14" height="11" rx="2"/><path d="M7.5 6.5h11a2 2 0 0 1 2 2v9"/>',
  "desks":'<rect x="4.5" y="8.5" width="12" height="8" rx="2"/><path d="M10.5 16.5v4M7.5 20.5h6M8.5 8.5v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/>',
  "statistics":'<path d="M4.5 4.5v16h16M9.5 16.5v-4M13.5 16.5v-8M17.5 16.5v-6"/>',
  "health":'<path d="M3.5 12.5h4.2l1.7-4.6 2.6 9.2 1.8-4.6H20.5"/>'
};
function lmIcon(name){
  const body=LM_ICONS[name];
  return body ? '<svg class="sx-ic" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    +' stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'+body+'</svg>' : '<span class="sx-ic"></span>';
}
export { lmIcon };
