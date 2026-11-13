const admin = require('firebase-admin');

// ==========================================
// INITIALIZE FIREBASE ADMIN
// ==========================================
if (!admin.apps.length) {
  // Fix the newline formatting for Vercel environment variables
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

// ==========================================
// GAME DATA & PROBABILITIES
// ==========================================
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
    { base: 100, weight: 0.01 }, { base: 0.5, weight: 37.67 }, { base: 50, weight: 0.02 },
    { base: 0.8, weight: 20 }, { base: 10, weight: 0.1 }, { base: 0.9, weight: 15 },
    { base: 5.0, weight: 0.2 }, { base: 1.2, weight: 12 }, { base: 1.5, weight: 8 },
    { base: 2.0, weight: 5 }, { base: 3.0, weight: 2 }
];

const ANIMALS = [
    { mult: 0.1, prob: 45.0 }, { mult: 0.3, prob: 25.0 }, { mult: 1.0, prob: 15.0 },
    { mult: 2.0, prob: 8.0 }, { mult: 3.0, prob: 4.0 }, { mult: 5.0, prob: 2.0 },
    { mult: 15.0, prob: 0.8 }, { mult: 100.0, prob: 0.2 }
];

const TREASURES = [
    { key: 'small', name: 'Small', mult: 0.2, prob: 55.0 },
    { key: 'silver', name: 'Silver', mult: 0.5, prob: 27.0 },
    { key: 'gold', name: 'Gold', mult: 1.0, prob: 12.0 },
    { key: 'diamond', name: 'Diamond', mult: 3.0, prob: 4.0 },
    { key: 'mega', name: 'Mega', mult: 10.0, prob: 1.7 },
    { key: 'jackpot', name: 'Jackpot', mult: 100.0, prob: 0.3 }
];

// ==========================================
// MAIN API ENDPOINT
// ==========================================
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = req.headers.authorization.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;
    
    // Extract request body
    const { gameType, betAmount, payload } = req.body;
    const selectedNum = (payload && payload.selectedNum) || req.body.selectedNum || 1;

    const walletRef = db.collection("wallets").doc(uid);
    const userRef = db.collection("users").doc(uid);
    const todayStr = new Date().toISOString().split('T')[0];

    const result = await db.runTransaction(async (t) => {
      const walletDoc = await t.get(walletRef);
      if (!walletDoc.exists) throw new Error("Wallet not found.");
      
      const balance = walletDoc.data().balance;
      if (balance < betAmount) throw new Error("Insufficient funds.");

      let payoutAmount = 0;
      let winData = null;
      let winFruit = null;
      let finalDailyLoss = 0;

      // ==========================================
      // GAME 1: FRUIT 777
      // ==========================================
      if (gameType === 'fruit_777') {
        const userDoc = await t.get(userRef);
        let currentDailyLoss = 0;
        
        // ✅ Fixed: No parentheses on exists
        if (userDoc.exists && userDoc.data().lastFruitPlayDate === todayStr) {
            currentDailyLoss = userDoc.data().fruitDailyLoss || 0;
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

        const scaleFactor = betAmount / 6;
        payoutAmount = fruitResult ? Math.floor(fruitResult.basePay * scaleFactor) : 0;
        winFruit = fruitResult;
        winData = fruitResult;

        const netLoss = Math.max(0, betAmount - payoutAmount);
        finalDailyLoss = (fruitResult && fruitResult.isJackpot) ? 0 : (currentDailyLoss + netLoss);
        t.update(userRef, { fruitDailyLoss: finalDailyLoss, lastFruitPlayDate: todayStr });
      } 
      
      // ==========================================
      // GAME 2: SUPER SPIN
      // ==========================================
      else if (gameType === 'super_spin') {
        const totalWeight = SUPER_SPIN.reduce((sum, item) => sum + item.weight, 0);
        let rand = Math.random() * totalWeight;
        let winIndex = 1;

        for (let i = 0; i < SUPER_SPIN.length; i++) {
            if (rand < SUPER_SPIN[i].weight) { winIndex = i; break; }
            rand -= SUPER_SPIN[i].weight;
        }
        payoutAmount = Math.floor(SUPER_SPIN[winIndex].base * betAmount);
        winData = { winIndex: winIndex }; 
      }
      
      // ==========================================
      // GAME 3: ANIMAL SPIN
      // ==========================================
      else if (gameType === 'animal_spin') {
        const rand = Math.random() * 100;
        let cumulative = 0;
        let winIndex = 0;
        for (let i = 0; i < ANIMALS.length; i++) {
            if (rand <= cumulative + ANIMALS[i].prob) { winIndex = i; break; }
            cumulative += ANIMALS[i].prob;
        }
        payoutAmount = Math.floor(ANIMALS[winIndex].mult * betAmount);
        winData = { winIndex: winIndex };
      }

      // ==========================================
      // GAME 4: LUCKY NUMBER
      // ==========================================
      else if (gameType === 'lucky_number') {
        const isMatch = Math.random() < (1 / 24);
        let drawnNum = Math.floor(Math.random() * 24) + 1;
        
        if (isMatch) {
            drawnNum = selectedNum;
            const tierRoll = Math.random();
            let mult = 0;
            let resultName = '';
            
            if (tierRoll < 0.70) { 
                mult = 10; 
                resultName = 'Standard Match'; 
            } else if (tierRoll < 0.95) { 
                mult = 30; 
                resultName = 'Special Match'; 
            } else { 
                mult = 150; 
                resultName = 'Jackpot Match'; 
            }
            
            payoutAmount = Math.floor(betAmount * mult);
            winData = { drawnNum: drawnNum, mult: mult, resultName: resultName };
        } else {
            while (drawnNum === selectedNum) {
                drawnNum = Math.floor(Math.random() * 24) + 1;
            }
            winData = { drawnNum: drawnNum, mult: 0, resultName: 'No Match' };
        }
      }

      // ==========================================
      // GAME 5: LUCKY TARGET
      // ==========================================
      else if (gameType === 'lucky_target') {
        const rand = Math.random() * 100;
        let mult = 0;
        let zoneName = 'Miss';
        let visualPos = 50;
        
        if (rand < 5) { 
            mult = 4.0; zoneName = 'Bullseye'; 
            visualPos = 50 + (Math.random() * 4 - 2); 
        } else if (rand < 20) { 
            mult = 1.5; zoneName = 'Inner'; 
            visualPos = Math.random() < 0.5 ? 50 - (4 + Math.random() * 6) : 50 + (4 + Math.random() * 6); 
        } else if (rand < 50) { 
            mult = 0.5; zoneName = 'Middle'; 
            visualPos = Math.random() < 0.5 ? 50 - (10 + Math.random() * 10) : 50 + (10 + Math.random() * 10); 
        } else if (rand < 80) { 
            mult = 0.15; zoneName = 'Outer'; 
            visualPos = Math.random() < 0.5 ? 50 - (20 + Math.random() * 10) : 50 + (20 + Math.random() * 10); 
        } else {
            visualPos = Math.random() < 0.5 ? 5 + Math.random() * 15 : 80 + Math.random() * 15;
        }
        
        payoutAmount = Math.floor(betAmount * mult);
        winData = { name: zoneName, mult: mult, visualPos: visualPos };
      }

      // ==========================================
      // GAME 6: LUCKY TREASURE
      // ==========================================
      else if (gameType === 'lucky_treasure') {
        const rand = Math.random() * 100;
        let cumulative = 0;
        let reward = TREASURES[0];
        
        for (let r of TREASURES) {
            if (rand <= cumulative + r.prob) { reward = r; break; }
            cumulative += r.prob;
        }
        payoutAmount = Math.floor(reward.mult * betAmount);
        winData = { key: reward.key, name: reward.name, mult: reward.mult };
      }

      else {
        throw new Error("Unknown game type: " + gameType);
      }

      // ==========================================
      // UPDATE DATABASE
      // ==========================================
      const netChange = payoutAmount - betAmount;
      const newBalance = balance + netChange;

      const txRef = db.collection("transactions").doc();
      t.set(txRef, {
        uid: uid, amount: netChange, type: 'game', gameType: gameType,
        betAmount: betAmount, payoutAmount: payoutAmount,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      t.update(walletRef, { balance: newBalance, lastTxId: txRef.id });

      const sessionRef = db.collection("game_sessions").doc();
      t.set(sessionRef, {
        uid: uid, gameType: gameType, betAmount: betAmount, payoutAmount: payoutAmount,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { 
        winData, 
        winFruit, 
        payoutAmount, 
        newBalance, 
        newDailyLoss: finalDailyLoss 
      };
    });

    return res.status(200).json({ success: true, ...result });

  } catch (error) {
    console.error("Play Error:", error);
    res.status(500).json({ error: error.message });
  }
};
