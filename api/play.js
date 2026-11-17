const admin = require('firebase-admin');

if (!admin.apps.length) {
  const formattedPrivateKey = process.env.FIREBASE_KEY 
    ? process.env.FIREBASE_KEY.replace(/\\n/g, '\n') 
    : undefined;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID || "jakipot",
      clientEmail: process.env.FIREBASE_EMAIL,
      privateKey: formattedPrivateKey,
    }),
  });
}

const db = admin.firestore();

// ✅ REAL ARRAYS POPULATED
const FRUITS = [
    { icon: '🍏', name: 'Green Apple', basePay: 1, prob: 8.0 },
    { icon: '🍓', name: 'Strawberry', basePay: 2, prob: 4.0 },
    { icon: '🍋', name: 'Lemon', basePay: 3, prob: 3.0 },
    { icon: '🍍', name: 'Pineapple', basePay: 4, prob: 2.0 },
    { icon: '🥥', name: 'Coconut', basePay: 5, prob: 1.5 },
    { icon: '🍒', name: 'Cherry', basePay: 8, prob: 1.0 },
    { icon: '🍎', name: 'Apple', basePay: 10, prob: 0.8 },
    { icon: '🍉', name: 'Melon', basePay: 15, prob: 0.5 },
    { icon: '🍌', name: 'Banana', basePay: 20, prob: 0.3 },
    { icon: '🍇', name: 'Grape', basePay: 50, prob: 0.2 },
    { icon: '🔔', name: 'Bell', basePay: 60, prob: 0.1 },
    { icon: '🍊', name: 'Orange', basePay: 120, prob: 0.05 },
    { icon: '🥭', name: 'Mango', basePay: 210, prob: 0.04 },
    { icon: '777', name: 'JACKPOT', basePay: 1000, prob: 0.01, isJackpot: true }
];

const LOSS_TARGET = 3000;

const SUPER_SPIN = [
    { base: 100,  weight: 1 }, { base: 0.5,  weight: 1 }, { base: 50,   weight: 1 },
    { base: 0.8,  weight: 1 }, { base: 10,   weight: 1 }, { base: 0.9,  weight: 1 },
    { base: 5.0,  weight: 1 }, { base: 1.2,  weight: 1 }, { base: 1.5,  weight: 1 },
    { base: 2.0,  weight: 1 }, { base: 3.0,  weight: 1 }
];

const ANIMALS = [
    { name: 'Wolf',     multiplier: 0.1,   probability: 45.0 },
    { name: 'Zebra',    multiplier: 0.3,   probability: 25.0 },
    { name: 'Giraffe',  multiplier: 1.0,   probability: 15.0 },
    { name: 'Gorilla',  multiplier: 2.0,   probability: 8.0 },
    { name: 'Elephant', multiplier: 3.0,   probability: 4.0 },
    { name: 'Cheetah',  multiplier: 5.0,   probability: 2.0 },
    { name: 'Tiger',    multiplier: 15.0,  probability: 0.8 },
    { name: 'Lion',     multiplier: 100.0, probability: 0.2 }
];

const TREASURES = [
    { key: 'small',   name: 'Small',   multiplier: 0.2,   prob: 40 },
    { key: 'silver',  name: 'Silver',  multiplier: 0.5,   prob: 25 },
    { key: 'gold',    name: 'Gold',    multiplier: 1.0,   prob: 15 },
    { key: 'diamond', name: 'Diamond', multiplier: 3.0,   prob: 10 },
    { key: 'mega',    name: 'Mega',    multiplier: 10.0,  prob: 9 },
    { key: 'jackpot', name: 'Jackpot', multiplier: 100.0, prob: 1 }
];

module.exports = async (req, res) => {
  // ✅ CORS HEADERS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 🚨 WARMUP BYPASS
  if (req.body?.action === 'warmup') {
      return res.status(200).json({ status: 'awake' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized: Missing token." });
    }
    const token = authHeader.split('Bearer ')[1];
    
    console.log("⏳ Verifying Firebase Token...");
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;
    console.log("✅ Token Verified for UID:", uid);
    
    const { gameType, betAmount, payload } = req.body;
    
    const safeBetAmount = Number(betAmount) || 0;
    if (safeBetAmount <= 0) throw new Error("Invalid bet amount.");

    const selectedNum = Number((payload && payload.selectedNum) || req.body.selectedNum || 1);

    const walletRef = db.collection("wallets").doc(uid);
    const userRef = db.collection("users").doc(uid);
    const todayStr = new Date().toISOString().split('T')[0];

    console.log(`🎮 Starting Firestore Transaction for ${gameType}...`);

    const result = await db.runTransaction(async (t) => {
      const walletDoc = await t.get(walletRef);
      if (!walletDoc.exists) throw new Error("Wallet not found.");
      
      const balance = Number(walletDoc.data().balance) || 0;
      if (balance < safeBetAmount) throw new Error("Insufficient funds.");

      let payoutAmount = 0;
      let winData = null;
      let winFruit = null;
      let finalDailyLoss = 0;

      if (gameType === 'fruit_777') {
        const userDoc = await t.get(userRef);
        let currentDailyLoss = 0;
        
        if (userDoc.exists && userDoc.data().lastFruitPlayDate === todayStr) {
            currentDailyLoss = Number(userDoc.data().fruitDailyLoss) || 0;
        }
        const isUnlocked = currentDailyLoss >= LOSS_TARGET;

        const rand = Math.random() * 100;
        let cumulative = 0;
        let fruitResult = null;
        
        for (let f of FRUITS) {
            if (f.isJackpot) {
                if (!isUnlocked) continue;
                if (rand <= cumulative + 1.0) { fruitResult = f; break; }
                continue;
            }
            if (rand <= cumulative + f.prob) { fruitResult = f; break; }
            cumulative += f.prob;
        }

        const scaleFactor = safeBetAmount / 6;
        payoutAmount = fruitResult ? Math.floor(fruitResult.basePay * scaleFactor) : 0;
        winFruit = fruitResult;
        winData = fruitResult;

        const netLoss = Math.max(0, safeBetAmount - payoutAmount);
        finalDailyLoss = (fruitResult && fruitResult.isJackpot) ? 0 : (currentDailyLoss + netLoss);
        t.update(userRef, { fruitDailyLoss: finalDailyLoss, lastFruitPlayDate: todayStr });
      } 
      else if (gameType === 'super_spin') {
        const totalWeight = SUPER_SPIN.reduce((sum, item) => sum + (item.weight || 1), 0);
        let rand = Math.random() * totalWeight;
        let winIndex = 0;
        
        for (let i = 0; i < SUPER_SPIN.length; i++) {
            const weight = SUPER_SPIN[i].weight || 1;
            if (rand < weight) { winIndex = i; break; }
            rand -= weight;
        }
        
        payoutAmount = Math.floor(SUPER_SPIN[winIndex].base * safeBetAmount);
        winData = { winIndex: winIndex }; 
      }
      else if (gameType === 'animal_spin') {
        const rand = Math.random() * 100;
        let cumulative = 0;
        let winIndex = 0;
        
        for (let i = 0; i < ANIMALS.length; i++) {
            if (rand <= cumulative + ANIMALS[i].probability) { winIndex = i; break; }
            cumulative += ANIMALS[i].probability;
        }
        
        payoutAmount = Math.floor(ANIMALS[winIndex].multiplier * safeBetAmount);
        winData = { winIndex: winIndex };
      }
      else if (gameType === 'lucky_number') {
        const isMatch = Math.random() < (1 / 24);
        let drawnNum = Math.floor(Math.random() * 24) + 1;
        
        if (isMatch) {
            drawnNum = selectedNum;
            const tierRoll = Math.random();
            let mult = 0;
            let resultName = '';
            
            if (tierRoll < 0.70) { mult = 10; resultName = 'Standard Match'; } 
            else if (tierRoll < 0.95) { mult = 30; resultName = 'Special Match'; } 
            else { mult = 150; resultName = 'Jackpot Match'; }
            
            payoutAmount = Math.floor(safeBetAmount * mult);
            winData = { drawnNum: drawnNum, mult: mult, resultName: resultName };
        } else {
            while (drawnNum === selectedNum) { drawnNum = Math.floor(Math.random() * 24) + 1; }
            winData = { drawnNum: drawnNum, mult: 0, resultName: 'No Match' };
        }
      }
      else if (gameType === 'lucky_target') {
        const rand = Math.random() * 100;
        let mult = 0;
        let zoneName = 'Miss';
        let visualPos = 50;
        
        if (rand < 5) { mult = 4.0; zoneName = 'Bullseye'; visualPos = 50 + (Math.random() * 4 - 2); } 
        else if (rand < 20) { mult = 1.5; zoneName = 'Inner'; visualPos = Math.random() < 0.5 ? 50 - (4 + Math.random() * 6) : 50 + (4 + Math.random() * 6); } 
        else if (rand < 50) { mult = 0.5; zoneName = 'Middle'; visualPos = Math.random() < 0.5 ? 50 - (10 + Math.random() * 10) : 50 + (10 + Math.random() * 10); } 
        else if (rand < 80) { mult = 0.15; zoneName = 'Outer'; visualPos = Math.random() < 0.5 ? 50 - (20 + Math.random() * 10) : 50 + (20 + Math.random() * 10); } 
        else { visualPos = Math.random() < 0.5 ? 5 + Math.random() * 15 : 80 + Math.random() * 15; }
        
        payoutAmount = Math.floor(safeBetAmount * mult);
        winData = { name: zoneName, mult: mult, visualPos: visualPos };
      }
      else if (gameType === 'lucky_treasure') {
        const rand = Math.random() * 100;
        let cumulative = 0;
        let reward = TREASURES[0]; // Default fallback
        
        for (let r of TREASURES) {
            const prob = r.prob || 10;
            if (rand <= cumulative + prob) { reward = r; break; }
            cumulative += prob;
        }
        
        payoutAmount = Math.floor(reward.multiplier * safeBetAmount);
        winData = { key: reward.key, name: reward.name, mult: reward.multiplier };
      }
      else {
        throw new Error("Unknown game type: " + gameType);
      }

      const safePayout = Number(payoutAmount) || 0;
      const netChange = safePayout - safeBetAmount;
      const newBalance = balance + netChange;

      const txRef = db.collection("transactions").doc();
      t.set(txRef, {
        uid: uid, amount: netChange, type: 'game', gameType: gameType,
        betAmount: safeBetAmount, payoutAmount: safePayout,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      t.update(walletRef, { balance: newBalance, lastTxId: txRef.id });

      const sessionRef = db.collection("game_sessions").doc();
      t.set(sessionRef, {
        uid: uid, gameType: gameType, betAmount: safeBetAmount, payoutAmount: safePayout,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { 
        winData, 
        winFruit, 
        payoutAmount: safePayout, 
        newBalance, 
        newDailyLoss: finalDailyLoss 
      };
    });

    console.log("✅ Transaction Complete! Sending Response.");
    return res.status(200).json({ success: true, ...result });

  } catch (error) {
    console.error("❌ Play Error:", error);
    res.status(500).json({ error: error.message });
  }
};
