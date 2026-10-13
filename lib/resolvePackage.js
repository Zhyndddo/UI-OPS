// Round 514 — ONE place that decides which package of a release is "the" package, same precedence as the
// Booking Board's buildPackageByRelease and the SQL booking_pkg_for_release():
//   1. release.project_type "Chỉ Phát Hành" + a package named "INT MEDIA"  (follow-up override)
//   2. a package named "Internal Package" (no precondition)
//   3. a package named exactly like release.project_type
// Since Round 501 the old "INT MEDIA" tier is stored as "Internal Package" while release.project_type can still
// say "INT MEDIA"; places that only did step 3 (exact name) could no longer find it.
export function resolvePackageForRelease(projectType, pkgs) {
  const list = pkgs || [];
  let pkg = null;
  if (projectType === "Chỉ Phát Hành") pkg = list.find((p) => p.name === "INT MEDIA") || null;
  if (!pkg) pkg = list.find((p) => p.name === "Internal Package") || null;
  if (!pkg) pkg = list.find((p) => p.name === projectType) || null;
  return pkg;
}
