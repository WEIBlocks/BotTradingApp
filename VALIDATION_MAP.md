COMPREHENSIVE VALIDATION & MODAL LAYOUT MAP
============================================

## 1. SHADOW MODE START MODAL (BotDetailsScreen.tsx)

Location: d:/Weiblocks/Bot_App/BotTradeApp/src/screens/bots/BotDetailsScreen.tsx

Modal visibility state: line 81
  const [shadowModalVisible, setShadowModalVisible] = useState(false);

Modal opened by: line 331
  setShadowModalVisible(true);

Modal closed by: line 372
  setShadowModalVisible(false);

### Modal JSX Structure (lines 1391-1494)

Modal wrapper: lines 1392-1396
  <Modal visible={shadowModalVisible} transparent animationType="slide" onRequestClose={() => setShadowModalVisible(false)}>

KeyboardAvoidingView: lines 1400-1402
  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
  Purpose: Push content up when keyboard opens on iOS

ScrollView inside KeyboardAvoidingView: lines 1403-1407
  contentContainerStyle={{flexGrow: 1, justifyContent: 'flex-end'}}
  keyboardShouldPersistTaps="handled"
  Lets long modal content scroll; bottom-aligns sheet

Modal sheet container: line 1408
  <View style={modalStyles.sheet}>

Duration selector: lines 1420-1439
  Label: line 1421 ("DURATION")
  Options rendered: lines 1423-1439 (DURATION_OPTIONS array)
  Custom option: lines 1434-1439

Custom days input (when selected): lines 1442-1455
  TextInput: lines 1444-1452
    - style: modalStyles.customInput
    - keyboardType: "number-pad"
    - maxLength: 3
    - placeholder: "Days"

Virtual balance input: lines 1457-1468
  Label: line 1458 ("VIRTUAL BALANCE")
  Dollar sign: line 1460 ("$")
  TextInput: lines 1461-1467
    - style: modalStyles.balanceInput
    - value: virtualBalance
    - keyboardType: "number-pad"
    - maxLength: 8

Min order value input: lines 1470-1484
  Label: line 1471 ("MIN ORDER VALUE (PER TRADE)")
  Dollar sign: line 1473 ("$")
  TextInput: lines 1474-1480
    - style: modalStyles.balanceInput
    - value: shadowMinOrder
    - keyboardType: "decimal-pad"
    - maxLength: 8
  Help text: lines 1482-1483 (shows min floor: $1 for stocks, $10 for crypto)

Confirm button: lines 1486-1489
  <TouchableOpacity style={modalStyles.confirmBtn} onPress={handleConfirmShadow}>
  Inside ScrollView (scrollable, not position: absolute)
  Followed by disclaimer text at line 1490

### Client-side validation (handleConfirmShadow, lines 333-378)

Balance validation: lines 340-342
  const balance = parseFloat(virtualBalance) || 10000;
  if (balance < 100) {
    showAlert('Invalid Balance', 'Virtual balance must be at least $100.');
  }

Min order floor determination: lines 344-349
  const isStockBotCheck = bot.category === 'Stocks';
  const minOrderFloor = isStockBotCheck ? 1 : 10;
  const parsedMinOrder = parseFloat(shadowMinOrder) || minOrderFloor;
  if (parsedMinOrder < minOrderFloor) {
    showAlert('Invalid Min Order', `Minimum order must be at least $${minOrderFloor}...`);
  }

Custom days validation: lines 354-360
  if (selectedDurationIdx === -1) {
    const days = parseInt(customDays, 10);
    if (!days || days <= 0) {
      showAlert('Invalid Duration', 'Please enter a valid number of days.');
    }


## 2. LIVE MODE PURCHASE SCREEN (BotPurchaseScreen.tsx)

Location: d:/Weiblocks/Bot_App/BotTradeApp/src/screens/bots/BotPurchaseScreen.tsx

Min order default: line 115
  setMinOrderInput(required === 'stocks' ? '1' : '10');

Min floor determination: line 127
  const minFloor = requiredAssetClass === 'stocks' ? 1 : 10;

### TextInputs in BotPurchaseScreen

Allocated amount input: lines 406-414
  label: "AMOUNT TO ALLOCATE" (line 397)
  TextInput properties:
    - keyboardType: "decimal-pad"
    - placeholder: "0"
    - value: allocatedAmount
    - editable: only if matchingExchange exists

Min order value input: lines 432-443
  label: "MIN ORDER VALUE (PER TRADE)" (line 428)
  TextInput properties:
    - keyboardType: "decimal-pad"
    - fontSize: 28
    - placeholder: String(minFloor)
    - value: minOrderInput

validateAmount: lines 130-138 (returns error or '')
validateMinOrder: lines 140-145 (returns error or '')

doActivate & handleActivate: lines 160-187, 189-227
  Both validate inputs before proceeding


## 3. BACKEND SHADOW MODE SCHEMA (bots.schema.ts)

shadowModeBodySchema: lines 83-92
  virtualBalance: z.number().positive()
  durationDays: z.number().int().min(0).optional()
  durationMinutes: z.number().int().positive().optional()
  minOrderValue: z.number().positive().optional()
  Refinement: either durationDays > 0 OR durationMinutes > 0 required


## 4. BACKEND LIVE MODE SCHEMA (bots.schema.ts)

purchaseBotBodySchema: lines 76-81
  allocatedAmount: z.number().positive().optional()
  minOrderValue: z.number().positive().optional()


## 5. BACKEND SHADOW MODE SERVICE (bots.service.ts)

Function: startShadowMode (lines 376-469)

Min order validation: lines 425-426
  const resolvedMinOrder = config.minOrderValue && config.minOrderValue >= 1 ? config.minOrderValue : 10;

Virtual balance stored as-is (line 434)


## 6. BACKEND LIVE MODE SERVICE (bots.service.ts)

Function: purchaseBot (lines 253-374)

Requested amount validation: lines 318-324
  Checks: > 0, <= availableBalance

Min order floor: lines 330-331
  stocks = $1, crypto = $10

Min order check: lines 332-333
  if minOrderValue < minFloor: throw ValidationError


## 7. TRADE ENGINE MIN CONSTANT (bot-engine.ts)

Function: executeLiveTrade (lines 1043-1194)

MIN_ORDER_VALUE determination: lines 1107-1110
  If subMinOrder > 0: use subMinOrder
  Else: use env.MIN_STOCK_ORDER_USD (default 1) or env.MIN_CRYPTO_ORDER_USD (default 10)

Trade value check: lines 1111-1114
  if (tradeValue < MIN_ORDER_VALUE): skip trade, return error


## 8. ENVIRONMENT CONSTANTS (config/env.ts)

MIN_CRYPTO_ORDER_USD: line 98 (default: 10)
MIN_STOCK_ORDER_USD: line 99 (default: 1)


## KEY FINDINGS

### Shadow Modal Keyboard Issue (CRITICAL)

BotDetailsScreen shadow modal structure (lines 1391-1494):
  Modal → KeyboardAvoidingView (line 1400) → ScrollView (line 1403) → View sheet (line 1408) → TextInputs + Button (line 1487)

PROBLEM:
  1. Confirm button is INSIDE the ScrollView (line 1487), not in fixed footer
  2. ScrollView has contentContainerStyle={{flexGrow: 1, justifyContent: 'flex-end'}} (line 1405)
  3. Sheet has paddingBottom: 90 (line 1912) to reserve space for keyboard
  4. When keyboard appears: scrolls content up, but button may be at bottom of scroll area
  5. When keyboard closes: entire content may shift, leaving button below visible viewport

COMPARISON - BotPurchaseScreen (safer design):
  KeyboardAvoidingView → ScrollView (content) + View footer (button outside scroll)
  Button is in fixed footer, unaffected by ScrollView scrolling


### Validation Rules

User Input Validation:
  Shadow virtual balance: >= $100 (client line 340)
  Live allocated amount: > 0 AND <= availableBalance (client lines 131-135, backend lines 318-323)
  Min order (both): >= $1 stocks OR >= $10 crypto (client lines 348, 143; backend lines 332-333)

Engine-Level (NOT user input validation):
  Calculated tradeValue must be >= subMinOrder OR env defaults (bot-engine.ts line 1110)
  If < minimum: trade SKIPPED (line 1111-1114), no record inserted, logged as error


### TextInput Specifications

BotDetailsScreen shadow modal:
  Custom days: keyboardType="number-pad", maxLength=3 (lines 1450-1451)
  Virtual balance: keyboardType="number-pad", maxLength=8 (lines 1465-1466)
  Min order: keyboardType="decimal-pad", maxLength=8 (lines 1477-1479)

BotPurchaseScreen:
  Allocated amount: keyboardType="decimal-pad", no maxLength (line 410)
  Min order: keyboardType="decimal-pad", no maxLength (line 434)
