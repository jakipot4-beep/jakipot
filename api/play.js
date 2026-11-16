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

// ... (Your FRUITS, SUPER_SPIN, ANIMALS, TREASURES arrays stay exactly the same) ...
const FRUITS = [ /* ... */ ];
const LOSS_TARGET = 3000;
const SUPER_SPIN = [ /* ... */ ];
const ANIMALS = [ /* ... */ ];
const TREASURES = [ /* ... */ ];

module.exports = async (req, res) => {
  // ✅ CORS HEADERS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 🚨 THE COLD START FIX: INSTANT WARMUP BYPASS
  // This wakes the server up instantly without verifying auth or hitting the DB.
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
      // ... YOUR EXACT TRANSACTION LOGIC STAYS HERE, DO NOT CHANGE IT ...
      // (Copy paste your existing runTransaction block here)
      
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
        // ... super spin logic ...
        const totalWeight = SUPER_SPIN.reduce((sum, item) => sum + item.weight, 0);
        let rand = Math.random() * totalWeight;
        let winIndex = 1;
        for (let i = 0; i < SUPER_SPIN.length; i++) {
            if (rand < SUPER_SPIN[i].weight) { winIndex = i; break; }
            rand -= SUPER_SPIN[i].weight;
        }
        payoutAmount = Math.floor(SUPER_SPIN[winIndex].base * safeBetAmount);
        winData = { winIndex: winIndex }; 
      }
      // ... rest of your games ...

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
