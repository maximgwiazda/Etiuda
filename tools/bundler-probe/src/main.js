import { greet } from './greet.js';
import './app.css';

// The closing tag in this string is the hazard, not an accident: it is the one sequence that
// would end the <script> element early and render the rest of the bundle as visible text.
const hazard = 'a string holding </script> inside it';

// Polish has to survive as characters rather than as escapes, or the artifact stops being
// readable exactly where a reviewer would look. esbuild needs charset utf8 for that.
const polish = 'żółć gęślą jaźń';

document.getElementById('out').textContent = greet('etiuda');
window.__probe = { greeted: greet('etiuda'), mark: 'PROBE_MAIN_MARKER', hazard, polish };
