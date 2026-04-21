/**
 * TradingViewChart — TradingView Lightweight Charts v4 embedded in a WebView.
 * Key design:
 *  - HTML is built ONCE (empty candles) — never rebuilt on data/timeframe change
 *  - All updates go through postMessage: 'init' (first load), 'setData' (TF change), 'updatePrice'
 *  - 'init' sets the initial visible range; 'setData' preserves the user's current zoom/pan
 *  - Fullscreen modal shares the same HTML instance (new WebView, same html string)
 *  - ScrollView lock: outer component sets scrollEnabled=false while user touches chart
 */

import React, {useRef, useEffect, useCallback, useMemo, useState} from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Dimensions,
  StatusBar,
  Text,
  Platform,
} from 'react-native';
import WebView from 'react-native-webview';
import type {OHLC} from './CandlestickChart';

export interface TradeMarker {
  time: number; // unix ms
  action: 'BUY' | 'SELL';
  price: number;
}

export interface TradingViewChartProps {
  data: OHLC[];
  livePrice?: number;
  width: number;
  height?: number;
  showVolume?: boolean;
  markers?: TradeMarker[];
  timeframe?: string;
}

function ohlcToLWC(candles: OHLC[]) {
  const seen = new Set<number>();
  return candles
    .map(c => {
      const t = typeof c.time === 'number' ? c.time : new Date(c.time).getTime();
      const sec = t > 1e10 ? Math.floor(t / 1000) : Math.floor(t);
      return {time: sec, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0};
    })
    .filter(c => {
      if (seen.has(c.time) || !c.open || !c.close) return false;
      seen.add(c.time);
      return true;
    })
    .sort((a, b) => a.time - b.time);
}

function markersToLWC(markers: TradeMarker[] = [], candles: {time: number}[]) {
  if (!markers.length || !candles.length) return [];
  const candleTimes = candles.map(c => c.time);
  const recent = markers.slice(-10);
  const seen = new Set<number>();
  return recent
    .map(m => {
      const sec = m.time > 1e10 ? Math.floor(m.time / 1000) : m.time;
      const nearest = candleTimes.reduce((a, b) => Math.abs(b - sec) < Math.abs(a - sec) ? b : a);
      const key = nearest * 10 + (m.action === 'BUY' ? 0 : 1);
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        time: nearest,
        position: m.action === 'BUY' ? 'belowBar' : 'aboveBar',
        color: m.action === 'BUY' ? '#10B981' : '#EF4444',
        shape: m.action === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: '',
        size: 1.2,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.time - b.time);
}

// How many seconds of data to show in the visible window for each TF.
// All history is still loaded and scrollable behind it.
// null = fit all (default view when no TF selected yet)
function windowSeconds(tf: string): number | null {
  switch (tf) {
    case '1m':  return 60;              // last 1 minute
    case '5m':  return 5 * 60;         // last 5 minutes
    case '15m': return 15 * 60;        // last 15 minutes
    case '1h':  return 60 * 60;        // last 1 hour
    case '4h':  return 4 * 60 * 60;    // last 4 hours
    case '1d':  return 24 * 60 * 60;   // last 1 day
    case '1w':  return 7 * 24 * 60 * 60; // last 1 week
    case '1M':  return 30 * 24 * 60 * 60; // last 1 month
    default:    return null;            // show all
  }
}

// Build HTML once — all candle data injected via postMessage
const CHART_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html,body { width:100%; height:100%; background:#0F1117; overflow:hidden; touch-action:none; }
  #chart { width:100%; height:100%; }
</style>
</head>
<body>
<div id="chart"></div>
<script src="https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"></script>
<script>
(function() {
  var candleSeries, volSeries, chart;
  var currentCandles = [];

  // Detect device local timezone offset in seconds (e.g. UTC-7 = -25200)
  var tzOffsetSec = -(new Date().getTimezoneOffset()) * 60;

  function fmtTime(sec) {
    // sec is unix seconds (UTC) — convert to local wall-clock
    var local = new Date((sec + tzOffsetSec - -(new Date().getTimezoneOffset())*60) * 1000);
    // Actually: just use JS Date which auto-converts to local
    var d = new Date(sec * 1000);
    var h = d.getHours().toString().padStart(2,'0');
    var m = d.getMinutes().toString().padStart(2,'0');
    return h + ':' + m;
  }

  function fmtDate(sec) {
    var d = new Date(sec * 1000);
    var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return mo[d.getMonth()] + ' ' + d.getDate();
  }

  chart = LightweightCharts.createChart(document.getElementById('chart'), {
    width: window.innerWidth,
    height: window.innerHeight,
    layout: {
      background: { color: '#0F1117' },
      textColor: 'rgba(255,255,255,0.6)',
      fontSize: 11,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.04)' },
      horzLines: { color: 'rgba(255,255,255,0.04)' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: 'rgba(255,255,255,0.2)', labelBackgroundColor: '#1E2029', width: 1 },
      horzLine: { color: 'rgba(255,255,255,0.2)', labelBackgroundColor: '#1E2029', width: 1 },
    },
    rightPriceScale: {
      borderColor: 'rgba(255,255,255,0.06)',
      textColor: 'rgba(255,255,255,0.5)',
      scaleMargins: { top: 0.06, bottom: 0.28 },
      autoScale: true,
    },
    localization: {
      timeFormatter: function(sec) {
        var d = new Date(sec * 1000);
        var h = d.getHours().toString().padStart(2,'0');
        var mi = d.getMinutes().toString().padStart(2,'0');
        var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return mo[d.getMonth()] + ' ' + d.getDate() + '  ' + h + ':' + mi;
      },
    },
    timeScale: {
      borderColor: 'rgba(255,255,255,0.06)',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 5,
      barSpacing: 6,
      minBarSpacing: 0.5,
      tickMarkFormatter: function(sec, markType) {
        var d = new Date(sec * 1000);
        var h = d.getHours().toString().padStart(2,'0');
        var mi = d.getMinutes().toString().padStart(2,'0');
        var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        // For day-level marks show date, for intraday show time
        if (markType === 0) return mo[d.getMonth()] + ' ' + d.getDate();
        return h + ':' + mi;
      },
    },
    // Full freedom: pinch zoom, horizontal drag, NO vertical scroll interference
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      pinch: true,
      mouseWheel: true,
      axisPressedMouseMove: { time: true, price: true },
    },
  });

  candleSeries = chart.addCandlestickSeries({
    upColor: '#10B981',
    downColor: '#EF4444',
    borderUpColor: '#10B981',
    borderDownColor: '#EF4444',
    wickUpColor: 'rgba(16,185,129,0.6)',
    wickDownColor: 'rgba(239,68,68,0.6)',
  });

  volSeries = chart.addHistogramSeries({
    color: 'rgba(99,102,241,0.3)',
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
    lastValueVisible: false,
    priceLineVisible: false,
  });
  chart.priceScale('volume').applyOptions({
    scaleMargins: { top: 0.80, bottom: 0.00 },
  });

  window.addEventListener('resize', function() {
    chart.applyOptions({ width: window.innerWidth, height: window.innerHeight });
  });

  function loadData(candles, markers, windowSecs) {
    currentCandles = candles;
    if (!candles.length) return;

    candleSeries.setData(candles);
    try { candleSeries.setMarkers(markers && markers.length ? markers : []); } catch(e) {}
    volSeries.setData(candles.map(function(c) {
      return { time: c.time, value: c.volume || 0,
        color: c.close >= c.open ? 'rgba(16,185,129,0.28)' : 'rgba(239,68,68,0.28)' };
    }));

    var lastTime = candles[candles.length - 1].time; // unix seconds

    if (windowSecs === null || windowSecs === undefined) {
      // No TF selected — fit all data, scrolled to most recent
      chart.timeScale().fitContent();
    } else {
      // Show exactly the TF window: from (lastCandle - windowSecs) to lastCandle
      // Clamp fromTime to the first available candle so we don't show empty space
      var fromTime = Math.max(candles[0].time, lastTime - windowSecs);
      try {
        chart.timeScale().setVisibleRange({ from: fromTime, to: lastTime + 60 });
      } catch(e) {
        chart.timeScale().scrollToRealTime();
      }
    }
  }

  document.addEventListener('message', onMsg);
  window.addEventListener('message', onMsg);

  function onMsg(e) {
    try {
      var msg = JSON.parse(e.data);

      if (msg.type === 'init' || msg.type === 'setData') {
        loadData(msg.candles || [], msg.markers || [], msg.windowSecs);

      } else if (msg.type === 'updatePrice') {
        if (!currentCandles.length) return;
        var last = currentCandles[currentCandles.length - 1];
        var u = { time: last.time, open: last.open,
          high: Math.max(last.high, msg.price),
          low: Math.min(last.low, msg.price),
          close: msg.price, volume: last.volume };
        candleSeries.update(u);
        volSeries.update({ time: u.time, value: u.volume || 0,
          color: u.close >= u.open ? 'rgba(16,185,129,0.28)' : 'rgba(239,68,68,0.28)' });
        currentCandles[currentCandles.length - 1] = u;

      } else if (msg.type === 'fitContent') {
        chart.timeScale().fitContent();
      }
    } catch(err) {}
  }

  try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' })); } catch(e) {}
})();
</script>
</body>
</html>`;

interface ChartWebViewProps {
  lwcCandles: ReturnType<typeof ohlcToLWC>;
  lwcMarkers: ReturnType<typeof markersToLWC>;
  livePrice?: number;
  windowSecs: number | null;
  timeframe: string;
  style?: object;
}

function ChartWebView({lwcCandles, lwcMarkers, livePrice, windowSecs, timeframe, style}: ChartWebViewProps) {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const initDoneRef = useRef(false);
  const lastPriceRef = useRef<number | undefined>();
  const lastTimeframeRef = useRef(timeframe);

  const post = useCallback((msg: object) => {
    webViewRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  const onMessage = useCallback((e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'ready') {
        readyRef.current = true;
        if (lwcCandles.length > 0) {
          post({type: 'init', candles: lwcCandles, markers: lwcMarkers, windowSecs});
          initDoneRef.current = true;
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Candles or timeframe changed
  useEffect(() => {
    if (!readyRef.current || lwcCandles.length === 0) return;
    const tfChanged = timeframe !== lastTimeframeRef.current;
    lastTimeframeRef.current = timeframe;

    if (!initDoneRef.current) {
      post({type: 'init', candles: lwcCandles, markers: lwcMarkers, windowSecs});
      initDoneRef.current = true;
    } else if (tfChanged) {
      post({type: 'setData', candles: lwcCandles, markers: lwcMarkers, windowSecs});
    }
    // Same TF, same candles update (live tick closed a candle) — zoom unchanged
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lwcCandles, lwcMarkers, timeframe]);

  // Live price tick — never touches zoom
  useEffect(() => {
    if (!readyRef.current || !livePrice) return;
    if (livePrice === lastPriceRef.current) return;
    lastPriceRef.current = livePrice;
    post({type: 'updatePrice', price: livePrice});
  }, [livePrice, post]);

  return (
    <WebView
      ref={webViewRef}
      source={{html: CHART_HTML}}
      style={[{flex: 1, backgroundColor: '#0F1117'}, style]}
      originWhitelist={['*']}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      startInLoadingState
      renderLoading={() => (
        <View style={[StyleSheet.absoluteFill, {alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F1117'}]}>
          <ActivityIndicator color="#10B981" size="small" />
        </View>
      )}
      mixedContentMode="always"
      androidLayerType="hardware"
      nestedScrollEnabled={false}
    />
  );
}

export default function TradingViewChart({
  data,
  livePrice,
  width,
  height = 300,
  showVolume = true,
  markers = [],
  timeframe = '4h',
}: TradingViewChartProps) {
  const [fullscreen, setFullscreen] = useState(false);

  const lwcCandles = useMemo(() => ohlcToLWC(data), [data]);
  const lwcMarkers = useMemo(() => markersToLWC(markers, lwcCandles), [markers, lwcCandles]);
  const winSecs = useMemo(() => windowSeconds(timeframe), [timeframe]);

  const {width: screenW, height: screenH} = Dimensions.get('screen');

  return (
    <>
      <View style={[styles.container, {width, height}]}>
        <TouchableOpacity
          style={styles.expandBtn}
          activeOpacity={0.8}
          onPress={() => setFullscreen(true)}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <View style={styles.iconBtn}>
            <Text style={styles.iconText}>⛶</Text>
          </View>
        </TouchableOpacity>

        <ChartWebView
          lwcCandles={lwcCandles}
          lwcMarkers={lwcMarkers}
          livePrice={livePrice}
          windowSecs={winSecs}
          timeframe={timeframe}
        />
      </View>

      <Modal
        visible={fullscreen}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullscreen(false)}>
        <StatusBar backgroundColor="#0F1117" barStyle="light-content" />
        <View style={[styles.fullscreenWrap, {width: screenW, height: screenH}]}>
          <TouchableOpacity
            style={styles.closeBtn}
            activeOpacity={0.8}
            onPress={() => setFullscreen(false)}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <View style={[styles.iconBtn, styles.iconBtnClose]}>
              <Text style={styles.iconText}>✕</Text>
            </View>
          </TouchableOpacity>

          <ChartWebView
            lwcCandles={lwcCandles}
            lwcMarkers={lwcMarkers}
            livePrice={livePrice}
            windowSecs={winSecs}
            timeframe={timeframe}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0F1117',
  },
  expandBtn: {
    position: 'absolute',
    top: 4,
    right: 52, // clear the price-scale axis on the right
    zIndex: 10,
  },
  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 44 : 56,
    right: 16,
    zIndex: 10,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: 'rgba(15,17,23,0.80)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnClose: {
    backgroundColor: 'rgba(239,68,68,0.18)',
    borderColor: 'rgba(239,68,68,0.4)',
  },
  iconText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 15,
  },
  fullscreenWrap: {
    backgroundColor: '#0F1117',
    flex: 1,
  },
});
