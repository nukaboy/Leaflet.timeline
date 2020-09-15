import S = require("nouislider")
/** @ignore */
import L = require("leaflet");


interface TimelineSliderControlOptions extends L.ControlOptions {

  /**
   * Show ticks on the timeline
   */
  showTicks?: boolean;
  /**
   * Wait until the user is finished changing the date to update the map. By
   * default, both the map and the date update for every change. With complex
   * data, this can slow things down, so set this to true to only update the
   * displayed date.
   */
  waitToUpdateMap?: boolean;
  /**
   * The start time of the timeline. If unset, this will be calculated
   * automatically based on the timelines registered to this control.
   */
  start?: number;
  /**
   * The end time of the timeline. If unset, this will be calculated
   * automatically based on the timelines registered to this control.
   */
  end?: number;


  /**
   * A function which takes the current time value (a Unix timestamp) and
   * outputs a string that is displayed beneath the control buttons.
   */
  formatOutput?(time: number): string;
}


/** @ignore */
type TSC = L.TimelineSliderControl;

declare module "leaflet" {
  export class TimelineSliderControl extends L.Control {
    container: HTMLElement;
    options: Required<TimelineSliderControlOptions>;
    timelines: L.Timeline[];
    start: number;
    end: number;
    map: L.Map;
    timeStart: number;
    timeEnd: number;
    syncedControl: TSC[];

    /** @ignore */
    _datalist?: HTMLDataListElement;
    /** @ignore */
    _output?: HTMLOutputElement;
    /** @ignore */
    _timeSlider: S.noUiSlider;

    /** @ignore */
    _timer: number;
    /** @ignore */
    _listener: (ev: KeyboardEvent) => any;

    /** @ignore */
    initialize(this: TSC, options: TimelineSliderControlOptions): void;
    /** @ignore */
    _getTimes(this: TSC): number[];
    /** @ignore */
    _nearestEventTime(this: TSC, findTime: number, mode?: 1 | -1): number;
    /** @ignore */
    _recalculate(this: TSC): void;
    /** @ignore */
    _createDOM(this: TSC): void;
    /** @ignore */
    _addKeyListeners(this: TSC): void;
    /** @ignore */
    _removeKeyListeners(this: TSC): void;
    /** @ignore */
    _buildDataList(this: TSC, container: HTMLElement): void;
    /** @ignore */
    _rebuildDataList(this: TSC): void;
    /** @ignore */
    _makeOutput(this: TSC, container: HTMLElement): void;
    /** @ignore */
    _makeSlider(this: TSC, container: HTMLElement): void;
    /** @ignore */
    _onKeydown(this: TSC, ev: KeyboardEvent): void;
    /** @ignore */
    _sliderChanged(
      this: TSC,
      e: { type: string; target: { valueMin: number, valueMax: number } }
    ): void;
    /** @ignore */
    _disableMapDragging(this: TSC): void;
    /** @ignore */
    _enableMapDragging(this: TSC): void;
    /** @ignore */
    _resetIfTimelinesChanged(this: TSC, oldTimelineCount: number): void;

    setTime(this: TSC, timeStart: number, timeEnd: number): void;
    addTimelines(this: TSC, ...timelines: L.Timeline[]): void;
    removeTimelines(this: TSC, ...timelines: L.Timeline[]): void;
    syncControl(this: TSC, controlToSync: TSC): void;
  }

  let timelineSliderControl: (options?: TimelineSliderControlOptions) => TSC;
}

// @ts-ignore
L.TimelineSliderControl = L.Control.extend({
  initialize(options = {}) {
    const defaultOptions: TimelineSliderControlOptions = {
      formatOutput: (output) => `${output || ""}`,
      showTicks: true,
      waitToUpdateMap: false,
      position: "bottomleft",
    };
    this.timelines = [];
    L.Util.setOptions(this, defaultOptions);
    L.Util.setOptions(this, options);
    this.start = options.start || 0;
    this.end = options.end || 0;
  },

  /* INTERNAL API *************************************************************/

  /**
   * @private
   * @returns A flat, sorted list of all the times of all layers
   */
  _getTimes() {
    const times: number[] = [];
    this.timelines.forEach((timeline) => {
      const timesInRange = timeline.times.filter(
        (time) => time >= this.start && time <= this.end
      );
      times.push(...timesInRange);
    });
    if (times.length) {
      times.sort((a, b) => a - b);
      const dedupedTimes = [times[0]];
      times.reduce((a, b) => {
        if (a !== b) {
          dedupedTimes.push(b);
        }
        return b;
      });
      return dedupedTimes;
    }
    return times;
  },

  /**
   * Adjusts start/end/step size. Should be called if any of those might
   * change (e.g. when adding a new layer).
   *
   * @private
   */
  _recalculate() {
    const manualStart = typeof this.options.start !== "undefined";
    const manualEnd = typeof this.options.end !== "undefined";
    let min = Infinity;
    let max = -Infinity;
    this.timelines.forEach((timeline) => {
      if (timeline.start < min) {
        min = timeline.start;
      }
      if (timeline.end > max) {
        max = timeline.end;
      }
    });
    if (!manualStart) {
      this.start = min;
      this._timeSlider.updateOptions({
        range: {
          'min': (min === Infinity ? 0 : min),
          'max': this._timeSlider.options.range['max']
        }
      });
      this._timeSlider.set([min, null]);
    }
    if (!manualEnd) {
      this.end = max;
      this._timeSlider.updateOptions({
        range: {
          'min': this._timeSlider.options.range['min'],
          'max': (max === -Infinity ? 0 : max)
        }
      });
    }
  },

  /**
   * @private
   * @param findTime The time to find events around
   * @param mode The operating mode.
   * If `mode` is 1, finds the event immediately after `findTime`.
   * If `mode` is -1, finds the event immediately before `findTime`.
   * @returns The time of the nearest event.
   */
  _nearestEventTime(findTime, mode = 1) {
    const times = this._getTimes();
    let retNext = false;
    let lastTime = times[0];
    for (let i = 1; i < times.length; i++) {
      const time = times[i];
      if (retNext) {
        return time;
      }
      if (time >= findTime) {
        if (mode === -1) {
          return lastTime;
        }
        if (time === findTime) {
          retNext = true;
        } else {
          return time;
        }
      }
      lastTime = time;
    }
    return lastTime;
  },

  /* DOM CREATION & INTERACTION ***********************************************/

  /**
   * Create all of the DOM for the control.
   *
   * @private
   */
  _createDOM() {
    const classes = [
      "leaflet-control-layers",
      "leaflet-control-layers-expanded",
      "leaflet-timeline-control",
    ];
    const container = L.DomUtil.create("div", classes.join(" "));
    this.container = container;

    this._makeSlider(container);
    if (this.options.showTicks) {
      this._buildDataList(container);
    }
  },

  /**
   * Add keyboard listeners for keyboard control
   *
   * @private
   */
  _addKeyListeners(): void {
    this._listener = (ev: KeyboardEvent) => this._onKeydown(ev);
    document.addEventListener("keydown", this._listener);
  },

  /**
   * Remove keyboard listeners
   *
   * @private
   */
  _removeKeyListeners(): void {
    document.removeEventListener("keydown", this._listener);
  },

  /**
   * Constructs a <datalist>, for showing ticks on the range input.
   *
   * @private
   * @param container The container to which to add the datalist
   */
  _buildDataList(container): void {
    this._rebuildDataList();
  },

  /**
   * Reconstructs the <datalist>. Should be called when new data comes in.
   */
  _rebuildDataList(): void {
    this._timeSlider.updateOptions({
      pips: {
        mode: 'values',
        values: this._getTimes(),
        density: 4
      }
    });
  },

  /**
   * DOM event handler to disable dragging on map
   *
   * @private
   */
  _disableMapDragging() {
    this.map.dragging.disable();
  },

  /**
   * DOM event handler to enable dragging on map
   *
   * @private
   */
  _enableMapDragging() {
    this.map.dragging.enable();
  },

  /**
   * Creates the range input
   *
   * @private
   * @param container The container to which to add the input
   */
  _makeSlider(container) {
    const slider = S.create(container, {
      start: [this.start || 0, this.end || 0],
      range: {
        'min': [this.start || 0],
        'max': [this.end || 0]
      }
    });
    this._timeSlider = slider;
    // register events using leaflet for easy removal


    this._timeSlider.on('update',
      () => this._sliderChanged({
        type: "change",
        target: { valueMin: Number(this._timeSlider.get()[0]), valueMax: Number(this._timeSlider.get()[1]) },
      })
    );
    this._timeSlider.on('start',
      () => this._disableMapDragging
    );
    this._timeSlider.on('end',
      () => this._enableMapDragging
    );
  },

  _makeOutput(container) {
    this._output = L.DomUtil.create(
      "output",
      "time-text",
      container
    ) as HTMLOutputElement;
    this._output.innerHTML = this.options.formatOutput(this.start);
  },

  _sliderChanged(e) {
    const time = e.target;
    this.timeStart = time.valueMin;
    this.timeEnd = time.valueMax;
    if (!this.options.waitToUpdateMap || e.type === "change") {
      this.timelines.forEach((timeline) => timeline.setStartTime(time.valueMin));
      this.timelines.forEach((timeline) => timeline.setEndTime(time.valueMax));
    }
    if (this._output) {
      this._output.innerHTML = this.options.formatOutput(time.valueMin).concat(" - ").concat(this.options.formatOutput(time.valueMax));
    }
  },

  _resetIfTimelinesChanged(oldTimelineCount) {
    if (this.timelines.length !== oldTimelineCount) {
      this._recalculate();
      if (this.options.showTicks) {
        this._rebuildDataList();
      }
      this.setTime(this.start, this.end);
    }
  },

  /* EXTERNAL API *************************************************************/

  /**
   * Register timeline layers with this control. This could change the start and
   * end points of the timeline (unless manually set).
   *
   * @param timelines The `L.Timeline`s to register
   */
  addTimelines(...timelines) {
    const timelineCount = this.timelines.length;
    timelines.forEach((timeline) => {
      if (this.timelines.indexOf(timeline) === -1) {
        this.timelines.push(timeline);
      }
    });
    this._resetIfTimelinesChanged(timelineCount);
  },

  /**
   * Unregister timeline layers with this control. This could change the start
   * and end points of the timeline unless manually set..
   *
   * @param timelines The `L.Timeline`s to unregister
   */
  removeTimelines(...timelines) {
    const timelineCount = this.timelines.length;
    timelines.forEach((timeline) => {
      const index = this.timelines.indexOf(timeline);
      if (index !== -1) {
        this.timelines.splice(index, 1);
      }
    });
    this._resetIfTimelinesChanged(timelineCount);
  },


  /**
   * Set the time displayed.
   *
   * @param time The time to set
   */
  setTime(timeStart: number, timeEnd: number) {
    if (this._timeSlider) this._timeSlider.set([timeStart, timeEnd]);
    this._sliderChanged({
      type: "change",
      target: { valueMin: timeStart, valueMax: timeEnd },
    });
  },

  onAdd(map: L.Map): HTMLElement {
    this.map = map;
    this._createDOM();
    this.setTime(this.start, this.end);
    return this.container;
  },

  onRemove() {
    // cleanup events registered in _makeSlider
    this._timeSlider.off('change'
    );
    this._timeSlider.off('start'
    );
    this._timeSlider.off('end'
    );
    L.DomEvent.off(
      document.body,
      "pointerup mouseup touchend",
      this._enableMapDragging,
      this
    );
    // make sure that dragging is restored to enabled state
    this._enableMapDragging();
  },

  syncControl(controlToSync) {
    if (!this.syncedControl) {
      this.syncedControl = [];
    }
    this.syncedControl.push(controlToSync);
  },
});

L.timelineSliderControl = (options?: TimelineSliderControlOptions) =>
  new L.TimelineSliderControl(options);
