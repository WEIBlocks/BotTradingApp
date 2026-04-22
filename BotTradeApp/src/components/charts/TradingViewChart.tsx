/**
 * TradingViewChart — TradingView Lightweight Charts v4 in a WebView.
 *
 * Design:
 *  - HTML built once; all data via postMessage
 *  - 'load'        → full setData + set visible range (TF change / big batch / new closed candle)
 *  - 'updatePrice' → live tick on current open candle only (no zoom change)
 *  - windowSecs null → fitContent (show all loaded history)
 *
 * Windowing: each TF has a "default view" — how many candles worth of seconds to show
 * in the initial visible window. This mirrors how real exchanges behave:
 *   1m  → show last 3h   (180 candles)
 *   3m  → show last 6h   (120 candles)
 *   5m  → show last 8h   (96 candles)
 *   15m → show last 12h  (48 candles)
 *   30m → show last 1d   (48 candles)
 *   1h  → show last 3d   (72 candles)
 *   2h  → show last 5d   (60 candles)
 *   4h  → show last 10d  (60 candles)
 *   6h  → show last 15d  (60 candles)
 *   12h → show last 30d  (60 candles)
 *   1d  → show last 6m   (180 candles)
 *   3d  → show last 1y   (120 candles)
 *   1w  → show last 2y   (104 candles)
 *   1M  → fitContent (show all monthly candles)
 *   all → fitContent
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
  time:   number;
  action: 'BUY' | 'SELL';
  price:  number;
}

export interface TradingViewChartProps {
  data:        OHLC[];
  livePrice?:  number;
  width:       number;
  height?:     number;
  showVolume?: boolean;
  markers?:    TradeMarker[];
  timeframe?:  string;
}

// ─── ohlcToLWC: ms timestamps → unix seconds, dedup, sort ───────────────────

function toSec(t: string | number): number {
  const ms = typeof t === 'number' ? t : new Date(t).getTime();
  return ms > 1e10 ? Math.floor(ms / 1000) : Math.floor(ms);
}

function ohlcToLWC(candles: OHLC[]) {
  const seen = new Set<number>();
  return candles
    .map(c => ({
      time:   toSec(c.time),
      open:   c.open,
      high:   c.high,
      low:    c.low,
      close:  c.close,
      volume: c.volume ?? 0,
    }))
    .filter(c => {
      if (seen.has(c.time) || !c.open || !c.close) return false;
      seen.add(c.time);
      return true;
    })
    .sort((a, b) => a.time - b.time);
}

function markersToLWC(markers: TradeMarker[] = [], candles: {time: number}[]) {
  if (!markers.length || !candles.length) return [];
  const times  = candles.map(c => c.time);
  const recent = markers.slice(-10);
  const seen   = new Set<number>();
  return recent
    .map(m => {
      const sec     = toSec(m.time);
      const nearest = times.reduce((a, b) => Math.abs(b - sec) < Math.abs(a - sec) ? b : a);
      const key     = nearest * 10 + (m.action === 'BUY' ? 0 : 1);
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        time:     nearest,
        position: m.action === 'BUY' ? 'belowBar' : 'aboveBar',
        color:    m.action === 'BUY' ? '#10B981' : '#EF4444',
        shape:    m.action === 'BUY' ? 'arrowUp'  : 'arrowDown',
        text:     '',
        size:     1.2,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.time - b.time);
}

// ─── windowSeconds: how many seconds of history to show initially ────────────
// Tuned to show ~60 candles on open — same density as Binance/TradingView default.
// null → fitContent (show all loaded candles).
function windowSeconds(tf: string): number | null {
  switch (tf) {
    case '1m':  return 60  * 60;               // 60 × 1m  = 1 hour
    case '3m':  return 3   * 60 * 60;          // 60 × 3m  = 3 hours
    case '5m':  return 5   * 60 * 60;          // 60 × 5m  = 5 hours
    case '15m': return 15  * 60 * 60;          // 60 × 15m = 15 hours
    case '30m': return 30  * 60 * 60;          // 60 × 30m = 30 hours
    case '1h':  return 60  * 60 * 60;          // 60 × 1h  = 2.5 days
    case '2h':  return 120 * 60 * 60;          // 60 × 2h  = 5 days
    case '4h':  return 240 * 60 * 60;          // 60 × 4h  = 10 days
    case '6h':  return 360 * 60 * 60;          // 60 × 6h  = 15 days
    case '12h': return 720 * 60 * 60;          // 60 × 12h = 30 days
    case '1d':  return 60  * 24 * 60 * 60;     // 60 × 1d  = 2 months
    case '3d':  return 180 * 24 * 60 * 60;     // 60 × 3d  = 6 months
    case '1w':  return 420 * 24 * 60 * 60;     // 60 × 1w  = ~14 months
    case '1M':
    case 'all':
    default:    return null;                   // fitContent
  }
}

// ─── Chart HTML (built once, all data via postMessage) ───────────────────────

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
        var h  = d.getHours().toString().padStart(2,'0');
        var mi = d.getMinutes().toString().padStart(2,'0');
        var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return mo[d.getMonth()] + ' ' + d.getDate() + '  ' + h + ':' + mi;
      },
    },
    timeScale: {
      borderColor: 'rgba(255,255,255,0.06)',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 8,
      barSpacing: 10,
      minBarSpacing: 1,
      tickMarkFormatter: function(sec, markType) {
        var d  = new Date(sec * 1000);
        var h  = d.getHours().toString().padStart(2,'0');
        var mi = d.getMinutes().toString().padStart(2,'0');
        var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        if (markType === 0) return mo[d.getMonth()] + ' ' + d.getDate();
        return h + ':' + mi;
      },
    },
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
    upColor:        '#10B981',
    downColor:      '#EF4444',
    borderUpColor:  '#10B981',
    borderDownColor:'#EF4444',
    wickUpColor:    'rgba(16,185,129,0.6)',
    wickDownColor:  'rgba(239,68,68,0.6)',
  });

  volSeries = chart.addHistogramSeries({
    color:           'rgba(99,102,241,0.3)',
    priceFormat:     { type: 'volume' },
    priceScaleId:    'volume',
    lastValueVisible: false,
    priceLineVisible: false,
  });
  chart.priceScale('volume').applyOptions({
    scaleMargins: { top: 0.80, bottom: 0.00 },
  });

  window.addEventListener('resize', function() {
    chart.applyOptions({ width: window.innerWidth, height: window.innerHeight });
  });

  function applyData(candles, markers, windowSecs) {
    if (!candles || !candles.length) return;
    currentCandles = candles;

    candleSeries.setData(candles);
    try { candleSeries.setMarkers(markers && markers.length ? markers : []); } catch(e) {}
    volSeries.setData(candles.map(function(c) {
      return {
        time: c.time, value: c.volume || 0,
        color: c.close >= c.open ? 'rgba(16,185,129,0.28)' : 'rgba(239,68,68,0.28)',
      };
    }));

    var lastTime = candles[candles.length - 1].time;
    if (windowSecs === null || windowSecs === undefined) {
      chart.timeScale().fitContent();
    } else {
      var fromTime = Math.max(candles[0].time, lastTime - windowSecs);
      var rightPad = Math.floor(windowSecs / 20);
      try {
        chart.timeScale().setVisibleRange({ from: fromTime, to: lastTime + rightPad });
      } catch(e) {
        chart.timeScale().fitContent();
      }
    }
  }

  document.addEventListener('message', onMsg);
  window.addEventListener('message', onMsg);

  function onMsg(e) {
    try {
      var msg = JSON.parse(e.data);

      if (msg.type === 'load') {
        applyData(msg.candles || [], msg.markers || [], msg.windowSecs);

      } else if (msg.type === 'updatePrice') {
        if (!currentCandles.length) return;
        var last = currentCandles[currentCandles.length - 1];
        var u = {
          time: last.time, open: last.open,
          high: Math.max(last.high, msg.price),
          low:  Math.min(last.low,  msg.price),
          close: msg.price, volume: last.volume,
        };
        candleSeries.update(u);
        volSeries.update({
          time: u.time, value: u.volume || 0,
          color: u.close >= u.open ? 'rgba(16,185,129,0.28)' : 'rgba(239,68,68,0.28)',
        });
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

// ─── ChartWebView ────────────────────────────────────────────────────────────

interface ChartWebViewProps {
  lwcCandles:  ReturnType<typeof ohlcToLWC>;
  lwcMarkers:  ReturnType<typeof markersToLWC>;
  livePrice?:  number;
  windowSecs:  number | null;
  timeframe:   string;
  style?:      object;
}

function ChartWebView({lwcCandles, lwcMarkers, livePrice, windowSecs, timeframe, style}: ChartWebViewProps) {
  const webViewRef        = useRef<WebView>(null);
  const readyRef          = useRef(false);
  const lastPriceRef      = useRef<number | undefined>();
  const lastSentTF        = useRef('');
  const lastSentLen       = useRef(0);
  const lastSentLastTime  = useRef(0);
  const pendingRef        = useRef<{candles: any[]; markers: any[]; ws: number | null} | null>(null);

  const post = useCallback((msg: object) => {
    webViewRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  const doLoad = useCallback((candles: any[], markers: any[], ws: number | null, tf: string) => {
    post({type: 'load', candles, markers, windowSecs: ws});
    lastSentTF.current       = tf;
    lastSentLen.current      = candles.length;
    lastSentLastTime.current = candles.length ? candles[candles.length - 1].time : 0;
    lastPriceRef.current     = candles.length ? candles[candles.length - 1].close : undefined;
  }, [post]);

  const onMessage = useCallback((e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'ready') {
        readyRef.current = true;
        if (pendingRef.current) {
          const p = pendingRef.current;
          pendingRef.current = null;
          doLoad(p.candles, p.markers, p.ws, lastSentTF.current || timeframe);
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doLoad]);

  // Decide whether to send a full reload
  useEffect(() => {
    if (lwcCandles.length === 0) return;

    const tfChanged  = timeframe !== lastSentTF.current;
    // Large batch: pair/TF switch causes count to jump by many
    const bigBatch   = Math.abs(lwcCandles.length - lastSentLen.current) > 3;
    // New closed candle appended (last time changed, count didn't decrease)
    const newCandle  = lwcCandles.length > 0 &&
      lwcCandles[lwcCandles.length - 1].time !== lastSentLastTime.current &&
      lwcCandles.length >= lastSentLen.current;

    if (!tfChanged && !bigBatch && !newCandle) return;

    if (!readyRef.current) {
      pendingRef.current = {candles: lwcCandles, markers: lwcMarkers, ws: windowSecs};
      lastSentTF.current = timeframe;
      return;
    }

    doLoad(lwcCandles, lwcMarkers, windowSecs, timeframe);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lwcCandles, lwcMarkers, timeframe, windowSecs]);

  // Live price tick — never changes zoom
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

// ─── Public component ────────────────────────────────────────────────────────

export default function TradingViewChart({
  data,
  livePrice,
  width,
  height = 300,
  showVolume = true,
  markers    = [],
  timeframe  = '4h',
}: TradingViewChartProps) {
  const [fullscreen, setFullscreen] = useState(false);

  const lwcCandles = useMemo(() => ohlcToLWC(data),                       [data]);
  const lwcMarkers = useMemo(() => markersToLWC(markers, lwcCandles),     [markers, lwcCandles]);
  const winSecs    = useMemo(() => windowSeconds(timeframe),               [timeframe]);

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
    right: 52,
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
    borderColor:     'rgba(239,68,68,0.4)',
  },
  iconText: {
    color:    '#FFFFFF',
    fontSize: 13,
    lineHeight: 15,
  },
  fullscreenWrap: {
    backgroundColor: '#0F1117',
    flex: 1,
  },
});
