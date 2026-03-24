/**
 * Debug logging interface.
 * Set Debug.enabled = false to silence all output.
 *
 * Usage:
 *   Debug.log('loader', 'exhibit 0 loaded')
 *   Debug.floorState(0, lMinY, posY)    // logs first 30 calls per exhibit
 *   Debug.exhibitState(manager)          // logs slot status table
 */
export const Debug = {
  enabled: true,

  log(category, ...args) {
    if (!this.enabled) return
    console.log(`[${category}]`, ...args)
  },

  // Per-exhibit floor log counter — only log first 30 frames per exhibit
  _floorCounts: {},

  floorState(index, lMinY, posY) {
    if (!this.enabled) return
    const c = (this._floorCounts[index] ?? 0) + 1
    this._floorCounts[index] = c
    if (c <= 30) {
      console.log(`[floor] #${String(c).padStart(2)} exhibit=${index}  lMinY=${lMinY.toFixed(4)}  pos.y=${posY.toFixed(4)}`)
    }
  },

  resetFloorCount(index) {
    this._floorCounts[index] = 0
  },

  exhibitState(manager) {
    if (!this.enabled) return
    const active = manager.activeIndex
    const lines = manager.exhibits.map((ex, i) => {
      const flag = i === active ? '→' : ' '
      return `  ${flag} [${i.toString().padStart(2)}] status=${ex.status ?? 'none'} alive=${!!ex.alive} bones=${!!ex.showingBones}`
    })
    console.log(`[manager] activeIndex=${active}`)
    console.log(lines.join('\n'))
  },
}
