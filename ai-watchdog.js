/**
 * JAKIPOT GUARDIAN AI - WATCHDOG MODULE (Hardened v2)
 * SECURITY: No passwords, deep-sanitized, rate-limited.
 * ARCHITECTURE: Writes to 'security_logs' only. Admin UI reads this to generate alerts.
 */

import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-ai.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Whitelist of allowed event names to prevent log flooding
const ALLOWED_EVENTS = [
    "FAILED_LOGIN_ATTEMPT",
    "RAPID_DEPOSIT_REQUEST",
    "NEW_COUNTRY_LOGIN",
    "PASSWORD_RESET_REQUEST",
    "SUSPICIOUS_NAVIGATION"
];

// Deep sanitization to remove any sensitive keys at any depth
function sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    const forbiddenKeys = ['password', 'pin', 'sms', 'clipboard', 'card', 'cvv', 'token', 'secret'];
    const sanitized = Array.isArray(obj) ? [] : {};
    
    for (const [key, value] of Object.entries(obj)) {
        if (forbiddenKeys.some(fk => key.toLowerCase().includes(fk))) {
            continue; // Skip forbidden keys
        }
        sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
}

export class JakipotWatchdog {
    constructor(app) {
        this.app = app;
        this.db = getFirestore(app);
        this.ai = getAI(app, {
            backend: new GoogleAIBackend(),
            useLimitedUseAppCheckTokens: true
        });
        this.model = getGenerativeModel(this.ai, { model: "gemini-3.8-flash" });
        
        this.eventBuffer = [];
        this.isProcessing = false;
        this.AI_COOLDOWN_MS = 30000; 
        this.lastAIAnalysisTime = 0;
    }

    start() {
        console.log("🐕 Watchdog: Active.");
        this.flushInterval = setInterval(() => {
            if (this.eventBuffer.length > 0) this.analyzeBufferedEvents();
        }, 15000);
    }

    stop() {
        clearInterval(this.flushInterval);
    }

    logEvent(eventName, details = {}) {
        if (!ALLOWED_EVENTS.includes(eventName)) {
            console.warn(`Watchdog: Ignored unknown event "${eventName}".`);
            return;
        }

        const safeDetails = sanitizeObject(details);
        this.eventBuffer.push({
            event: eventName,
            timestamp: new Date().toISOString(),
            details: safeDetails
        });
    }

    async analyzeBufferedEvents() {
        const now = Date.now();
        if (now - this.lastAIAnalysisTime < this.AI_COOLDOWN_MS || this.isProcessing || this.eventBuffer.length === 0) return;
        
        this.isProcessing = true;
        this.lastAIAnalysisTime = now;
        const eventsToAnalyze = [...this.eventBuffer];
        this.eventBuffer = [];

        const prompt = `
            You are the Jakipot Security AI. Analyze these events for fraud.
            Respond strictly in JSON: {"riskScore": [0-100], "severity": ["Low"|"Medium"|"High"|"Critical"], "explanation": "..."}
            Events: ${JSON.stringify(eventsToAnalyze)}
        `;

        try {
            const result = await this.model.generateContent(prompt);
            let responseText = result.response.text();
            
            // Clean markdown formatting if AI wraps JSON in ```json
            responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const analysis = JSON.parse(responseText);

            await this.saveAnalysisToFirestore(analysis, eventsToAnalyze);
        } catch (error) {
            console.error("Watchdog AI Error:", error);
        } finally {
            this.isProcessing = false;
        }
    }

    async saveAnalysisToFirestore(analysis, rawEvents) {
        // Only log events with Risk >= 50 to save Firestore writes
        if (analysis.riskScore >= 50) {
            try {
                // Write ONLY to security_logs. Admin Dashboard will read this.
                await addDoc(collection(this.db, "security_logs"), {
                    riskScore: analysis.riskScore,
                    severity: analysis.severity,
                    explanation: analysis.explanation,
                    rawEvents: rawEvents,
                    timestamp: new Date()
                });
                console.log("📝 Security log saved for Admin review.");
            } catch (dbError) {
                console.error("Failed to write security log:", dbError);
            }
        }
    }
}