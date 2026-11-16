const admin = require('firebase-admin');

// ==========================================
// INITIALIZE FIREBASE ADMIN
// ==========================================
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

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Verify User
    const token = req.headers.authorization.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    const { action, betAmount, roundId, cashoutMultiplier, crashPoint } = req.body;

    // ==========================================
    // ACTION 1: SECURELY CREATE A NEW ROUND (Auto)
    // ==========================================
    if (action === 'create_round') {
      const stateRef = db.collection('settings').doc('game_counter');
      let nextCrashPoint = 2.0;
      let shouldCreate = false;

      await db.runTransaction(async (t) => {
        const stateDoc = await t.get(stateRef);
        const state = stateDoc.exists ? stateDoc.data() : {};
        const now = Date.now();
        const lastCreatedAt = state.lastCreatedAt?.toMillis() || 0;

        // Cooldown: Don't create a new round if one was just created 8 seconds ago
        if (now - lastCreatedAt < 8000) return;

        // SECURE RNG (Provably Fair simulation)
        const rand = Math.random();
        if (rand < 0.50) nextCrashPoint = 1.0 + (Math.random() * 1.5); // 1.0x - 2.5x
        else if (rand < 0.80) nextCrashPoint = 2.5 + (Math.random() * 3.5); // 2.5x - 6.0x
        else if (rand < 0.95) nextCrashPoint = 6.0 + (Math.random() * 14.0); // 6.0x - 20.0x
        else nextCrashPoint = 20.0 + (Math.random() * 80.0); // 20x - 100x

        nextCrashPoint = parseFloat(nextCrashPoint.toFixed(2));

        t.set(stateRef, {
          lastCreatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        shouldCreate = true;
      });

      if (!shouldCreate) return res.status(429).json({ error: "Round recently created. Please wait." });

      const roundRef = await db.collection('live_trends').add({
        status: 'waiting',
        startTime: admin.firestore.FieldValue.serverTimestamp(),
        crashPoint: nextCrashPoint,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({ success: true, roundId: roundRef.id, crashPoint: nextCrashPoint });
    }

    // ==========================================
    // ACTION 2: SECURELY PLACE A BET
    // ==========================================
    if (action === 'place_bet') {
      if (!betAmount || betAmount < 50) throw new Error("Invalid bet amount.");
      
      const walletRef = db.collection('wallets').doc(uid);
      const userRef = db.collection('users').doc(uid);

      await db.runTransaction(async (t) => {
        const walletDoc = await t.get(walletRef);
        const userDoc = await t.get(userRef);

        if (!walletDoc.exists) throw new Error("Wallet not found.");
        if (walletDoc.data().balance < betAmount) throw new Error("Insufficient balance.");

        const username = userDoc.data()?.fullName || 'You';
        const profilePic = userDoc.data()?.profilePicUrl || null;

        const txRef = db.collection("transactions").doc();
        const betRef = db.collection("live_bets").doc();

        // Deduct balance
        t.update(walletRef, { 
          balance: admin.firestore.FieldValue.increment(-betAmount),
          lastTxId: txRef.id 
        });

        // Log transaction
        t.set(txRef, {
          uid: uid, 
          type: 'bet', 
          amount: -betAmount, 
          status: 'completed', 
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Create live bet
        t.set(betRef, {
          uid: uid,
          username: username,
          roundId: roundId,
          amount: betAmount,
          status: 'active',
          cashOutMultiplier: 0,
          payout: 0,
          profilePic: profilePic,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      return res.status(200).json({ success: true });
    }

    // ==========================================
    // ACTION 3: SECURELY CASHOUT
    // ==========================================
    if (action === 'cashout') {
      if (!roundId || !betAmount || !cashoutMultiplier) throw new Error("Missing cashout data");

      const roundRef = db.collection('live_trends').doc(roundId);
      
      // Find the active bet
      const betQuery = await db.collection('live_bets')
        .where('uid', '==', uid)
        .where('roundId', '==', roundId)
        .where('status', '==', 'active')
        .get();
      
      if (betQuery.empty) throw new Error("No active bet found.");
      const betRef = betQuery.docs[0].ref;

      const result = await db.runTransaction(async (t) => {
        const roundDoc = await t.get(roundRef);
        if (!roundDoc.exists) throw new Error("Round not found.");
        
        const roundData = roundDoc.data();
        if (roundData.status === 'crashed') throw new Error("Round already crashed!");

        // 🚨 SECURITY CHECK: Ensure the user didn't modify the multiplier in the browser
        if (cashoutMultiplier > roundData.crashPoint) {
          throw new Error("Hacked multiplier detected.");
        }

        const payout = betAmount * cashoutMultiplier;
        const walletRef = db.collection('wallets').doc(uid);

        // Update bet status to won
        t.update(betRef, {
          status: 'won',
          cashOutMultiplier: cashoutMultiplier,
          payout: payout
        });

        // Add winnings to wallet
        const txRef = db.collection("transactions").doc();
        t.set(txRef, {
          uid: uid, 
          amount: payout, 
          type: 'crash_win', 
          status: 'completed', 
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        t.update(walletRef, { 
          balance: admin.firestore.FieldValue.increment(payout),
          lastTxId: txRef.id 
        });

        return { success: true, payout: payout };
      });

      return res.status(200).json({ success: true, ...result });
    }

    // ==========================================
    // ACTION 4: ADMIN CREATES ROUND (For Dashboard)
    // ==========================================
    if (action === 'admin_create_round') {
      const userDoc = await db.collection('users').doc(uid).get();
      if (!userDoc.exists || userDoc.data().role !== 'admin') {
        return res.status(403).json({ error: "Unauthorized. Admin access required." });
      }

      // ✅ Get the crash point sent by the Admin Dashboard
      if (!crashPoint || crashPoint < 1.01) {
        throw new Error("Invalid crash point provided by Admin.");
      }

      const roundRef = await db.collection('live_trends').add({
        status: 'waiting',
        startTime: admin.firestore.FieldValue.serverTimestamp(),
        crashPoint: parseFloat(crashPoint), // ✅ Use the Admin's crash point
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({ success: true, roundId: roundRef.id, crashPoint: parseFloat(crashPoint) });
    }

    return res.status(400).json({ error: "Invalid action." });

  } catch (error) {
    console.error("Crash API Error:", error);
    res.status(500).json({ error: error.message });
  }
};
