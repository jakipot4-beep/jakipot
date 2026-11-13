const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: "jakipot",
      clientEmail": "firebase-adminsdk-fbsvc@jakipot.iam.gserviceaccount.com",
      privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDKYBAXW0glVn1y\nh1s0vnpyKctH2g0QzXJC+3WMZ8i/XoGzEd50XILjYpEtlYSLc1jEEzS6wxG3Ow3f\nBuP8nQIxENm/+Lo6KCD9Daa6sMW/+F+IPbQXBoSc6OICnK58rnXxGdHuehIIT61C\ngwX0dAeMwVZ0hc+/o1+kMFWvBmIULJ25L7YwMVVvQLL87irW/dUPzSqB5VgmOMFL\n3GyzJ41upDIaG4ch+e2LxSNv0aCXfsmSrCTYaB6YHFc202OPpLnOj2fEH730ZXSu\n2ZSoe5vO/hwxs+3aSwbBIANh+sEYDBlH4S+qvusLtsIrjxscll6Ajf46BcJ4jNXx\nsPNf3eLHAgMBAAECggEAH1js9Sk7DimNCfoEezGMFvX5WnpgrrscGVsJFMQYuOfj\nMEEy05Rm4+DnOwfffZhS5iBReSJxMpAvsF3JX95UMhR5nj5hXlPL9FayflWWdAt9\nhMWGCVEFpqZ+J8hsULzXYQ7OUWHQPEBXRqez+u8kIj3qbecyTG16iZzBEPjspVIT\nWgo1nkKOnZyIoHZ7hgwjGl/1axpbUGNMi8mZOPR0XDZVMo7zztVoV/XCqP88VCAm\noimxC1q75hx75jwouVoS0ZthYpC6v7A7F06qGZVqSrghNSndPdJoPOykDIA0GK1H\nYU8UtxvuBOQErxeqgxEizSKZo/Hzmp5bn2bNCsFf/QKBgQDqu3qvx3blPffHLjsY\ncUh2rkC3r0VE5kqUpnsIA/n0ccF3afJar5hiv+zvy3cR+JpjNtmbyB0rlGRcgZwY\ndbFDfHF8fE3OBjj2WbV25K9eHnUB9y0B40IBJRTvc8FBZnDtfyyuoPcIlso3OMY+\nvVEnyBG4PobRbrfB0Bje/ljI9QKBgQDcthLx/vW0HOE4Cpbg6ASmba1Jmjskd6jA\nRQtS/hfdSVQ5kzG50vKd1tMHba8RHUwz9x5y5Vopc4z1DbRMvYHTaISbVBK21sjg\nI7HhnSAumxou4yhbWRQxI9UWPz5WlDSFGpBD57UrbezReu1v1AaWmuUIzXIRCchp\nw8w+jnkXSwKBgBdGE3oOSumb5U9odA+OW+L4kA4mYLXeJ5LpltVKn6PvC4GtjYwU\nUQWphfKYt+uePKCNtbHOe6XwhqrtZu697J+GXTI8mPJOh6NVbbqmHgU0++EAAwRm\n5gp7BMJhNc4oPBYwP9votdWyLcaf6HgcCUnqemdMO83ULoAXBABIM8FpAoGAJ3I/\nJpMb1MoIkpyJ5L5y/k/B1dLD2TutpFdys62IFFujuvqMu5pxFDat1rkKvfNPiEYV\nYhGNsLTfL3j4jXKdPmyCrsQy6AyxMCYRB7KuasX7wv+EWfcsva+ayPQarxyj2loq\nCIjj/1QRLEtdHkx1tPsQDiexyEvITubYnSGXkMsCgYASeuvEw8p6GMGL0RLMZVLq\nFoLy169tduE7AeklT0TmJKXCrcF25XBcx0KIhJsHaw29vpKCIri7WVJxtBVC53iA\np73uSaH1PeOfnAur8rxMML4AMtH3XgzJ+EQZyVeA/orRV5LT/jMvLXHtC7hMdWNA\n16/IEzRKIU2uu4Y1JFQrLQ==\n-----END PRIVATE KEY-----\n",
    }),
  });
}

const db = admin.firestore();

const FRUITS = [
    { icon: '🍏', basePay: 1, prob: 8.0 }, { icon: '🍓', basePay: 2, prob: 4.0 },
    { icon: '🍋', basePay: 3, prob: 3.0 }, { icon: '🍍', basePay: 4, prob: 2.0 },
    { icon: '🥥', basePay: 5, prob: 1.5 }, { icon: '🍒', basePay: 8, prob: 1.0 },
    { icon: '🍎', basePay: 10, prob: 0.8 }, { icon: '🍉', basePay: 15, prob: 0.5 },
    { icon: '🍌', basePay: 20, prob: 0.3 }, { icon: '🍇', basePay: 50, prob: 0.2 },
    { icon: '🔔', basePay: 60, prob: 0.1 }, { icon: '🍊', basePay: 120, prob: 0.05 },
    { icon: '🥭', basePay: 210, prob: 0.04 }, { icon: '777', basePay: 1000, prob: 0.01, isJackpot: true }
];
const LOSS_TARGET = 3000;

const SPIN_WHEEL = [
    { base: 100, weight: 0.01 }, { base: 0.5, weight: 37.67 }, { base: 50, weight: 0.02 },
    { base: 0.8, weight: 20 }, { base: 10, weight: 0.1 }, { base: 0.9, weight: 15 },
    { base: 5.0, weight: 0.2 }, { base: 1.2, weight: 12 }, { base: 1.5, weight: 8 },
    { base: 2.0, weight: 5 }, { base: 3.0, weight: 2 }
];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = req.headers.authorization.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;
    const { gameType, betAmount } = req.body;

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
      let finalDailyLoss = 0;

      if (gameType === 'fruit_777') {
        const userDoc = await t.get(userRef);
        let currentDailyLoss = 0;
        if (userDoc.exists() && userDoc.data().lastFruitPlayDate === todayStr) {
            currentDailyLoss = userDoc.data().fruitDailyLoss || 0;
        }
        const isUnlocked = currentDailyLoss >= LOSS_TARGET;

        const rand = Math.random() * 100;
        let cumulative = 0;
        
        for (let f of FRUITS) {
            if (f.isJackpot) {
                if (!isUnlocked) continue;
                if (rand <= cumulative + 1.0) { winData = f; break; }
                continue;
            }
            if (rand <= cumulative + f.prob) { winData = f; break; }
            cumulative += f.prob;
        }

        const scaleFactor = betAmount / 6;
        payoutAmount = winData ? winData.basePay * scaleFactor : 0;
        
        const netLoss = Math.max(0, betAmount - payoutAmount);
        finalDailyLoss = (winData && winData.isJackpot) ? 0 : (currentDailyLoss + netLoss);

        t.update(userRef, { fruitDailyLoss: finalDailyLoss, lastFruitPlayDate: todayStr });
      } else if (gameType === 'super_spin') {
        const totalWeight = SPIN_WHEEL.reduce((sum, item) => sum + item.weight, 0);
        let rand = Math.random() * totalWeight;
        let winIndex = 1;

        for (let i = 0; i < SPIN_WHEEL.length; i++) {
            if (rand < SPIN_WHEEL[i].weight) { winIndex = i; break; }
            rand -= SPIN_WHEEL[i].weight;
        }

        payoutAmount = Math.floor(SPIN_WHEEL[winIndex].base * betAmount);
        winData = { winIndex: winIndex }; 
      } else {
        throw new Error("Unknown game type.");
      }

      const netChange = payoutAmount - betAmount;
      const newBalance = balance + netChange;

      const txRef = db.collection("transactions").doc();
      t.set(txRef, {
        uid: uid, amount: netChange, type: 'game', gameType: gameType,
        betAmount: betAmount, payoutAmount: payoutAmount, createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      t.update(walletRef, { balance: newBalance, lastTxId: txRef.id });

      const sessionRef = db.collection("game_sessions").doc();
      t.set(sessionRef, {
        uid: uid, gameType: gameType, betAmount: betAmount, payoutAmount: payoutAmount, createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { winData, payoutAmount, newBalance, newDailyLoss: finalDailyLoss };
    });

    return res.status(200).json({ success: true, ...result });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
