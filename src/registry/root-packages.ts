// gen's two entry-point generator packages; everything each pulls in
// transitively (e.g. generator-js's own dependency on generator-base) is
// resolved dynamically via registryFor(), not listed here by hand.
export const ROOT_PACKAGES = ['@sektek/generator-base', '@sektek/generator-js'];
