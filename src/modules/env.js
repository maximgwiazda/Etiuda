/* Engine version. Semantic: MAJOR changes the catalog contract, MINOR adds capability,
   PATCH fixes. The catalog carries its own separate version - engine and content are
   released independently, and `format` in the catalog is the compatibility contract. */
const E_VERSION="2.0.0-dev";
/* The day this build was made, YYYY-MM-DD, written over the placeholder by tools/build.mjs; the
   source itself carries none, and About leaves the line out until it is a date. */
const E_BUILT="@E_BUILT@";

export {
  E_BUILT,
  E_VERSION
};
