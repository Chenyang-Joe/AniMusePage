import * as THREE from 'three'
import { loadExhibit } from './loader.js'

import { Debug } from '../utils/debug.js'

/**
 * Manages per-exhibit state, lazy loading, and floor tracking.
 *
 * - slots[i]: { group, plateMat }  from buildCarousel()
 * - manifest: array of { index, animal, action, predFile, bonesFile }
 * - Lazy: only load activeIndex ± 2; cache max 5 loaded at once
 *
 * Per-exhibit state (this.exhibits[i]):
 *   status:        'unloaded' | 'loading' | 'loaded'
 *   alive:         bool — animation is playing
 *   showingBones:  bool — bones model is visible
 *   predModel, bonesModel, predMixer, bonesMixer, predAction, bonesAction
 *   predMeshNode, baseLocalMinY, floorScaleY, initialOffsetY  (floor tracking)
 *   _bonesBox:     THREE.Box3 instance (per-exhibit, reused each frame)
 */
export class ExhibitManager {
  constructor(slots, manifest) {
    this.slots          = slots
    this.manifest       = manifest
    this.N              = slots.length
    this.exhibits       = manifest.map(() => ({ status: 'unloaded', alive: false, showingBones: false }))
    this.activeIndex    = 0
    this._loadOrder     = []   // LRU: most recently activated at front
    this._floorTracker  = null // cached for current active exhibit
  }

  // Load all exhibits upfront
  async loadAll(onProgress) {
    for (let i = 0; i < this.N; i++) {
      await this._loadOne(i)
      if (onProgress) onProgress(i, this.N)
    }
    Debug.log('manager', `all ${this.N} exhibits loaded`)
  }

  // Activate exhibit i (switch focus, no loading/unloading)
  async activate(index) {
    this.activeIndex = index
    Debug.log('manager', `activate(${index})`)

    // Load if not yet loaded (fallback for first call before loadAll)
    await this._loadOne(index)

    // Rebuild cached floor tracker for new active exhibit
    this._floorTracker = null

    Debug.exhibitState(this)
  }

  async _loadOne(index) {
    const ex = this.exhibits[index]
    if (ex.status !== 'unloaded') return
    ex.status = 'loading'

    try {
      const result = await loadExhibit(index, this.slots[index].group)
      Object.assign(ex, result, {
        status: 'loaded',
        alive:  false,
        showingBones: false,
        _bonesBox: new THREE.Box3(),
      })
      Debug.resetFloorCount?.(index)
    } catch (err) {
      ex.status = 'unloaded'
      console.error(`[manager] Failed to load exhibit ${index}:`, err)
    }
  }

  _unloadOne(index) {
    const ex = this.exhibits[index]
    if (ex.status !== 'loaded') return

    // Pause mixers
    ex.predMixer?.stopAllAction()
    ex.bonesMixer?.stopAllAction()

    // Remove models from slot group
    if (ex.predModel)  this.slots[index].group.remove(ex.predModel)
    if (ex.bonesModel) this.slots[index].group.remove(ex.bonesModel)

    // Dispose geometry + materials
    const dispose = model => {
      if (!model) return
      model.traverse(node => {
        node.geometry?.dispose()
        if (node.material) {
          [].concat(node.material).forEach(m => {
            m.map?.dispose()
            m.dispose()
          })
        }
      })
    }
    dispose(ex.predModel)
    dispose(ex.bonesModel)

    Object.assign(ex, {
      status: 'unloaded', alive: false, showingBones: false,
      predModel: null, bonesModel: null,
      predMixer: null, bonesMixer: null,
      predAction: null, bonesAction: null,
      predMeshNode: null,
    })

    this._loadOrder.splice(this._loadOrder.indexOf(index), 1)
    Debug.log('manager', `unloaded exhibit ${index}`)
  }

  getActive() {
    return this.exhibits[this.activeIndex]
  }

  // Advance mixers for the active exhibit
  update(delta) {
    const ex = this.exhibits[this.activeIndex]
    if (ex.status !== 'loaded' || !ex.alive) return
    ex.predMixer?.update(delta)
    ex.bonesMixer?.update(delta)
  }

  // Returns floor updater functions for the currently active exhibit.
  // Cached — only rebuilds when activeIndex changes.
  getFloorTracker() {
    if (this._floorTracker) return this._floorTracker

    const ex  = this.exhibits[this.activeIndex]
    const idx = this.activeIndex

    if (ex.status !== 'loaded' || !ex.predModel) {
      return { updatePredFloor: () => {}, updateBonesFloor: () => {} }
    }

    const { predModel, bonesModel, predMeshNode,
            baseLocalMinY, floorScaleY, initialOffsetY, _bonesBox } = ex

    const _predPos      = predMeshNode.geometry.attributes.position
    const _predMorphPos = predMeshNode.geometry.morphAttributes.position
    const _predWeights  = predMeshNode.morphTargetInfluences

    function updatePredFloor() {
      let frameLocalMinY = Infinity
      for (let v = 0; v < _predPos.count; v++) {
        let y = _predPos.getY(v)
        if (_predMorphPos) {
          for (let m = 0; m < _predWeights.length; m++) {
            if (_predWeights[m] > 1e-6) y += _predWeights[m] * _predMorphPos[m].getY(v)
          }
        }
        if (y < frameLocalMinY) frameLocalMinY = y
      }
      predModel.position.y = initialOffsetY - (frameLocalMinY - baseLocalMinY) * floorScaleY
      Debug.floorState(idx, frameLocalMinY, predModel.position.y)
    }

    function updateBonesFloor() {
      bonesModel.position.y = 0
      _bonesBox.setFromObject(bonesModel)
      bonesModel.position.y = 1.6 - _bonesBox.min.y
    }

    this._floorTracker = { updatePredFloor, updateBonesFloor }
    return this._floorTracker
  }
}
