/**
 * PortfolioTVChart — TradingView Lightweight Charts v4 line chart for portfolio equity.
 * - Live exchange portfolio only (no shadow/paper PnL mixed in)
 * - Line series (cleaner than area for sparse snapshot data)
 * - Timeframe tabs: 1D / 1W / 1M / 3M / 1Y / ALL
 * - Crosshair with price tooltip
 * - Fullscreen modal
 * - Real-time price tick via postMessage
 */

import React, {useRef, useEffect, useCallback, useMemo, useState} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Modal, Dimensions, StatusBar,
  ActivityIndicator, Platform,
} from 'react-native';
import WebView from 'react-native-webview';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface EquityPoint {
  time: number; // unix seconds
  value: number;
}

export interface PortfolioTVChartProps {
  /** Array of {time (unix seconds), value} for the equity curve */
  data: EquityPoint[];
  /** Current portfolio value shown in header */
  currentValue: number;
  width: number;
  height?: number;
  /** Called when user picks a different timeframe */
  onTimeframeChange?: (days: number, granularity: 'hourly' | 'daily') => void;
  loading?: boolean;
}

// ─── Timeframes ────────────────────────────────────────────────────────────────

type Granularity = 'hourly' | 'daily';

interface Timeframe {
  label: string;
  days: number;        // how far back to fetch from backend
  granularity: Granularity;
  windowHours?: number; // if set, trim chart to only show last N hours of returned data
}

// Timeframes aligned to snapshot granularity:
// - "1D" uses 2 days of hourly data so you see today's 5-min ticks + yesterday context
// - "1W" and longer use daily snapshots (one point per day, very clean)
const TIMEFRAMES: Timeframe[] = [
  {label: '1D',  days: 2,    granularity: 'hourly'},
  {label: '1W',  days: 7,    granularity: 'daily'},
  {label: '1M',  days: 30,   granularity: 'daily'},
  {label: '3M',  days: 90,   granularity: 'daily'},
  {label: '1Y',  days: 365,  granularity: 'daily'},
  {label: 'ALL', days: 9999, granularity: 'daily'},
];

// ─── HTML (built once, data injected via postMessage) ──────────────────────────

const CHART_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html,body { width:100%; height:100%; background:#0F1117; overflow:hidden; touch-action:pan-x; }
  #chart { width:100%; height:100%; }

  #tooltip {
    position:absolute;
    top:8px; left:8px;
    background:rgba(22,27,34,0.92);
    border:1px solid rgba(255,255,255,0.1);
    border-radius:8px;
    padding:7px 11px;
    pointer-events:none;
    display:none;
    z-index:100;
    min-width:120px;
  }
  #tooltip .tt-date {
    font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;
    font-size:10px; color:rgba(255,255,255,0.45); margin-bottom:3px;
  }
  #tooltip .tt-val {
    font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;
    font-size:15px; font-weight:700; color:#FFFFFF;
  }
  #tooltip .tt-chg {
    font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;
    font-size:10px; margin-top:2px;
  }
</style>
</head>
<body>
<div id="chart"></div>
<div id="tooltip">
  <div class="tt-date" id="tt-date">—</div>
  <div class="tt-val"  id="tt-val">—</div>
  <div class="tt-chg"  id="tt-chg"></div>
</div>
<script src="https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"></script>
<script>
(function() {
  var chart, lineSeries;
  var currentData = [];
  var firstValue = 0;

  function fmtMoney(v) {
    if (v >= 1e6)  return '$' + (v/1e6).toFixed(2) + 'M';
    if (v >= 1e4)  return '$' + (v/1e3).toFixed(1) + 'K';
    if (v >= 1e3)  return '$' + Math.round(v).toLocaleString();
    return '$' + v.toFixed(2);
  }

  var isIntraday = false;

  function fmtDate(sec) {
    var d = new Date(sec * 1000);
    var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (isIntraday) {
      var hh = d.getHours().toString().padStart(2,'0');
      var mm = d.getMinutes().toString().padStart(2,'0');
      return mo[d.getMonth()] + ' ' + d.getDate() + '  ' + hh + ':' + mm;
    }
    return mo[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  chart = LightweightCharts.createChart(document.getElementById('chart'), {
    width: window.innerWidth,
    height: window.innerHeight,
    layout: {
      background: { color: '#0F1117' },
      textColor: 'rgba(255,255,255,0.45)',
      fontSize: 10,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.03)' },
      horzLines: { color: 'rgba(255,255,255,0.05)' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Magnet,
      vertLine: {
        color: 'rgba(255,255,255,0.25)',
        labelBackgroundColor: '#1E2029',
        width: 1,
        style: LightweightCharts.LineStyle.Dashed,
      },
      horzLine: {
        color: 'rgba(255,255,255,0.15)',
        labelBackgroundColor: '#1E2029',
        width: 1,
        style: LightweightCharts.LineStyle.Dashed,
      },
    },
    rightPriceScale: {
      borderColor: 'rgba(255,255,255,0.06)',
      textColor: 'rgba(255,255,255,0.4)',
      scaleMargins: { top: 0.15, bottom: 0.12 },
      autoScale: true,
    },
    timeScale: {
      borderColor: 'rgba(255,255,255,0.06)',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 5,
      barSpacing: 10,
      minBarSpacing: 2,
      tickMarkFormatter: function(sec, markType) {
        var d = new Date(sec * 1000);
        var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        if (isIntraday) {
          var hh = d.getHours().toString().padStart(2,'0');
          var mm = d.getMinutes().toString().padStart(2,'0');
          if (markType === 0) return mo[d.getMonth()] + ' ' + d.getDate();
          return hh + ':' + mm;
        }
        if (markType === 0) return mo[d.getMonth()] + ' ' + d.getFullYear().toString().slice(-2);
        return mo[d.getMonth()] + ' ' + d.getDate();
      },
    },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale:  { pinch: true, mouseWheel: true, axisPressedMouseMove: { time: true, price: false } },
  });

  lineSeries = chart.addLineSeries({
    color: '#10B981',
    lineWidth: 2,
    lineStyle: LightweightCharts.LineStyle.Solid,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 5,
    crosshairMarkerBorderColor: '#10B981',
    crosshairMarkerBackgroundColor: '#0F1117',
    lastValueVisible: true,
    priceLineVisible: false,
    pointMarkersVisible: false,
  });

  window.addEventListener('resize', function() {
    chart.applyOptions({ width: window.innerWidth, height: window.innerHeight });
  });

  chart.subscribeCrosshairMove(function(param) {
    var tt = document.getElementById('tooltip');
    if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) {
      tt.style.display = 'none';
      return;
    }
    var val = param.seriesData.get(lineSeries);
    if (!val) { tt.style.display = 'none'; return; }
    var v = val.value;
    var chg = firstValue > 0 ? ((v - firstValue) / firstValue * 100) : 0;
    var isPos = chg >= 0;
    document.getElementById('tt-date').textContent = fmtDate(param.time);
    document.getElementById('tt-val').textContent = fmtMoney(v);
    var chgEl = document.getElementById('tt-chg');
    chgEl.textContent = (isPos ? '+' : '') + chg.toFixed(2) + '%';
    chgEl.style.color = isPos ? '#10B981' : '#EF4444';

    var ttW = 140;
    var x = param.point.x + 14;
    var y = 8;
    if (x + ttW > window.innerWidth - 60) x = param.point.x - ttW - 10;
    tt.style.left = Math.max(4, x) + 'px';
    tt.style.top  = y + 'px';
    tt.style.display = 'block';
  });

  function applyColor(isPos) {
    var clr = isPos ? '#10B981' : '#EF4444';
    lineSeries.applyOptions({ color: clr, crosshairMarkerBorderColor: clr });
  }

  function loadData(points) {
    if (!points || !points.length) return;

    // Sort ascending by time to guarantee no LightweightCharts ordering errors
    points = points.slice().sort(function(a, b) { return a.time - b.time; });

    // Deduplicate by timestamp (keep last value if same second)
    var seen = {};
    var deduped = [];
    for (var i = 0; i < points.length; i++) {
      seen[points[i].time] = points[i];
    }
    var keys = Object.keys(seen).map(Number).sort(function(a,b){return a-b;});
    for (var j = 0; j < keys.length; j++) deduped.push(seen[keys[j]]);

    if (!deduped.length) return;

    currentData = deduped;
    firstValue = deduped[0].value;

    var span = deduped[deduped.length-1].time - deduped[0].time;
    isIntraday = span < 2 * 86400;
    chart.applyOptions({ timeScale: { timeVisible: isIntraday, secondsVisible: false } });

    var lastVal = deduped[deduped.length - 1].value;
    applyColor(lastVal >= firstValue);

    lineSeries.setData(deduped);

    // Pad Y axis so the line is never touching the top/bottom edge
    var minVal = Infinity, maxVal = -Infinity;
    for (var k = 0; k < deduped.length; k++) {
      if (deduped[k].value < minVal) minVal = deduped[k].value;
      if (deduped[k].value > maxVal) maxVal = deduped[k].value;
    }
    var range = maxVal - minVal;
    // Flat line guard: force a ±5% visible range so the line is centred
    if (range < 0.01 && minVal > 0) {
      var pad = Math.max(minVal * 0.05, 1);
      lineSeries.applyOptions({
        autoscaleInfoProvider: function() {
          return { priceRange: { minValue: minVal - pad, maxValue: minVal + pad } };
        },
      });
    } else {
      lineSeries.applyOptions({ autoscaleInfoProvider: function() { return null; } });
    }

    chart.timeScale().fitContent();
  }

  function updateLastPoint(value) {
    if (!currentData.length) return;
    var last = currentData[currentData.length - 1];
    var updated = { time: last.time, value: value };
    lineSeries.update(updated);
    currentData[currentData.length - 1] = updated;
    applyColor(value >= firstValue);
  }

  document.addEventListener('message', onMsg);
  window.addEventListener('message',   onMsg);

  function onMsg(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.type === 'setData')         loadData(msg.points);
      else if (msg.type === 'updateLast') updateLastPoint(msg.value);
      else if (msg.type === 'fitContent') chart.timeScale().fitContent();
    } catch(err) {}
  }

  try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' })); } catch(e) {}
})();
</script>
</body>
</html>`;

// ─── Inner WebView ──────────────────────────────────────────────────────────────

interface TVWebViewProps {
  points: EquityPoint[];
  currentValue: number;
  style?: object;
}

function TVWebView({points, currentValue, style}: TVWebViewProps) {
  const wvRef    = useRef<WebView>(null);
  const readyRef = useRef(false);
  const lastValRef = useRef<number>(0);

  const post = useCallback((msg: object) => {
    wvRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  const onMessage = useCallback((e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'ready') {
        readyRef.current = true;
        if (points.length > 0) post({type: 'setData', points});
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send data when points change
  useEffect(() => {
    if (!readyRef.current || points.length === 0) return;
    post({type: 'setData', points});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // Live price tick — update last point only
  useEffect(() => {
    if (!readyRef.current || currentValue <= 0) return;
    if (currentValue === lastValRef.current) return;
    lastValRef.current = currentValue;
    post({type: 'updateLast', value: currentValue});
  }, [currentValue, post]);

  return (
    <WebView
      ref={wvRef}
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(v: number): string {
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 10_000)    return '$' + (v / 1_000).toFixed(1) + 'K';
  if (v >= 1_000)     return '$' + Math.round(v).toLocaleString('en-US');
  return '$' + v.toFixed(2);
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function PortfolioTVChart({
  data,
  currentValue,
  width,
  height = 240,
  onTimeframeChange,
  loading = false,
}: PortfolioTVChartProps) {
  const [selectedTF, setSelectedTF]       = useState('1M');
  const [fullscreen, setFullscreen]       = useState(false);
  const {width: screenW, height: screenH} = Dimensions.get('screen');

  const handleTF = useCallback((tf: Timeframe) => {
    setSelectedTF(tf.label);
    onTimeframeChange?.(tf.days, tf.granularity);
  }, [onTimeframeChange]);

  // All data is already scoped to the requested timeframe by the backend
  const visibleData = useMemo(() => data, [data]);

  // Compute change % from first → last visible point
  const {changeAmt, changePct, isPositive} = useMemo(() => {
    if (visibleData.length < 2) return {changeAmt: 0, changePct: 0, isPositive: true};
    const first = visibleData[0].value;
    const last  = visibleData[visibleData.length - 1].value;
    const amt   = last - first;
    const pct   = first > 0 ? (amt / first) * 100 : 0;
    return {changeAmt: amt, changePct: pct, isPositive: amt >= 0};
  }, [visibleData]);

  const accentColor = isPositive ? '#10B981' : '#EF4444';
  const changeSign  = isPositive ? '+' : '';

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerLabel}>PORTFOLIO VALUE</Text>
          <Text style={styles.headerValue}>{fmtMoney(currentValue)}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.changeBadge, {backgroundColor: isPositive ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)'}]}>
            <Text style={[styles.changePct, {color: accentColor}]}>
              {changeSign}{changePct.toFixed(2)}%
            </Text>
            <Text style={[styles.changeAmt, {color: accentColor}]}>
              {changeSign}{fmtMoney(Math.abs(changeAmt))}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.expandBtn}
            onPress={() => setFullscreen(true)}
            activeOpacity={0.7}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Text style={styles.expandIcon}>⛶</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Timeframe tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tfRow}>
        {TIMEFRAMES.map(tf => (
          <TouchableOpacity
            key={tf.label}
            activeOpacity={0.7}
            style={[styles.tfBtn, selectedTF === tf.label && {backgroundColor: accentColor}]}
            onPress={() => handleTF(tf)}>
            <Text style={[styles.tfTxt, selectedTF === tf.label && styles.tfTxtActive]}>
              {tf.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Chart ── */}
      <View style={[styles.chartWrap, {width, height}]}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#10B981" size="small" />
          </View>
        ) : visibleData.length < 1 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTxt}>
              Connecting to your exchange{'\n'}Equity curve updates every 5 minutes
            </Text>
          </View>
        ) : (
          <TVWebView points={visibleData} currentValue={currentValue} />
        )}
      </View>

      {/* ── Fullscreen modal ── */}
      <Modal
        visible={fullscreen}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullscreen(false)}>
        <StatusBar backgroundColor="#0F1117" barStyle="light-content" />
        <View style={[styles.fsWrap, {width: screenW, height: screenH}]}>
          <TouchableOpacity
            style={[styles.fsClose, {top: Platform.OS === 'android' ? 44 : 56}]}
            onPress={() => setFullscreen(false)}
            activeOpacity={0.8}>
            <Text style={styles.fsCloseTxt}>✕</Text>
          </TouchableOpacity>
          <TVWebView points={visibleData} currentValue={currentValue} />
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  headerLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  headerValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 28,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  changeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'flex-end',
  },
  changePct: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
  },
  changeAmt: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    marginTop: 1,
  },
  expandBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandIcon: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 15,
  },
  tfRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
    paddingRight: 4,
  },
  tfBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tfTxt: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  tfTxtActive: {color: '#FFFFFF'},
  chartWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0F1117',
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F1117',
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F1117',
    paddingHorizontal: 28,
  },
  emptyTxt: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.28)',
    textAlign: 'center',
    lineHeight: 18,
  },
  fsWrap: {
    backgroundColor: '#0F1117',
    flex: 1,
  },
  fsClose: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsCloseTxt: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
});
