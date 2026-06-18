import express from "express";
import sqlite3 from "sqlite3";
import cors from "cors";
import path from "path";
import fs from "fs";
import Stripe from "stripe";
import "dotenv/config";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    console.log("=> REQUEST:", req.method, req.url);
    next();
});

app.use(express.static(path.join(process.cwd(), "public")));

//Stripe
const stripeKey = process.env.STRIPE_SECRET_KEY;
const domain = process.env.DOMAIN;

if (!stripeKey) {
    console.error("STRIPE_SECRET_KEY ontbreekt");
    process.exit(1);
}

if (!domain) {
    console.error("DOMAIN ontbreekt");
    process.exit(1);
}

const stripe = new Stripe(stripeKey);

const db = new sqlite3.Database("./President.db", (err) => {
    if (err) {
        console.error("DB fout:", err.message);
    } else {
        console.log("Database verbonden");
    }
});

db.all(
    "SELECT name FROM sqlite_master WHERE type='table'",
    [],
    (err, rows) => {
        if (err) {
            console.error("tabel check fout:", err.message);
        } else {
            console.log("Tabellen in DB:", rows);
        }
    }
);

//maakt de database aan
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS categorieen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            naam TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS sauzen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            naam TEXT,
            prijs REAL
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS gerechten (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        naam TEXT,
        prijs REAL,
        beschrijving TEXT,
        categorieen_id INTEGER
    )
  `);

    db.run(`
        CREATE TABLE IF NOT EXISTS bestelling (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            datum DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            totale_prijs INTEGER NOT NULL,
            toestand TEXT DEFAULT 'open' NOT NULL,
            naam TEXT,
            betaalmethode text,
            FOREIGN KEY("gerechten_id") REFERENCES "gerechten"("id")
            )
        `);

    db.run(`
        CREATE TABLE IF NOT EXISTS gerecht_in_bestelling (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bestelling_id INTEGER NOT NULL,
            gerechten_id INTEGER NOT NULL,
            aantal INTEGER DEFAULT 1,
            FOREIGN KEY (bestelling_id) REFERENCES bestelling(id),
            FOREIGN KEY (gerechten_id) REFERENCES gerechten(id)
            )
        `);

    db.run(`
        CREATE TABLE IF NOT EXISTS bestelling_extras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bestelling_id INTEGER NOT NULL,
            gerechten_id INTEGER NOT NULL,
            groenten TEXT,
            sauzen TEXT,
            opmerking TEXT
        )
    `);


});

//haalt alle gerechten uit de database
app.get("/broodjes", (req, res) => {
    db.all("SELECT * FROM gerechten", [], (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});

//voegt een nieuw broodje toe aan de database
app.post("/broodjes", (req, res) => {
    const { naam, beschrijving, prijs, categorieen_id } = req.body;

    db.run(
        `INSERT INTO gerechten (naam, beschrijving, prijs, categorieen_id)
         VALUES (?, ?, ?, ?)`,
        [naam, beschrijving, prijs, categorieen_id],
        function (err) {
            if (err) return res.status(500).json(err);
            res.json({ success: true });
        }
    );
});

//haalt alle extras uit de database
app.get("/extras", (req, res) => {
    db.all(
        "SELECT * FROM extras",
        [],
        (err, rows) => {
            if (err) {
                console.error("extras fout:", err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        }
    );
});

//haalt alle sauzen uit de database
app.get("/sauzen", (req, res) => {
    db.all(
        "SELECT * FROM sauzen",
        [],
        (err, rows) => {
            if (err) {
                console.error("sauzen fout:", err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        }
    );
});

//haalt alle categorieen uit de database zoals koude broodje
app.get("/categorieen", (req, res) => {
    db.all("SELECT * FROM categorieen", [], (err, rows) => {
        if (err) {
            console.error("categorieen fout:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

//zorgt ervoor dat we de pagina's krijgen als we /... typen na localhost:3000
app.get("/", (req, res) => {
    res.sendFile(path.join(process.cwd(), "index.html"));
});

app.get("/index.html", (req, res) => {
    res.sendFile(path.join(process.cwd(), "index.html"));
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(process.cwd(), "aanpassen.html"));
});

app.get("/aanpassen.html", (req, res) => {
    res.sendFile(path.join(process.cwd(), "aanpassen.html"));
});

app.get("/contact.html", (req, res) => {
    res.sendFile(path.join(process.cwd(), "contact.html"));
});

app.get("/bestellen.html", (req, res) => {
    res.sendFile(path.join(process.cwd(), "bestellen.html"));
});

app.get("/afrekenen.html", (req, res) => {
    res.sendFile(path.join(process.cwd(), "afrekenen.html"));
});

app.get("/orders.html", (req, res) => {
    res.sendFile(path.join(process.cwd(), "orders.html"));
});

app.get("/success.html", (req, res) => {
    res.sendFile(path.join(process.cwd(), "success.html"))
});

app.get("/cancel.html", (req, res) => {
    res.sendFile(path.join(process.cwd(), "cancel.html"))
});

//dit is heel de code voor de betaling in stripe te regelen
app.post("/checkout", async (req, res) => {
    try {
        const { naam, items, totale_prijs, betaalmethode } = req.body;

        // Validatie
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "Geen producten gevonden" });
        }

        // 1. Sla bestelling op
        db.run(
            `INSERT INTO bestelling (naam, datum, totale_prijs, toestand, betaalmethode)
            VALUES (?, datetime('now'), ?, 'bezig', ?)`,
            [naam, totale_prijs, betaalmethode],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });

                const bestellingId = this.lastID; // ID van de net aangemaakte bestelling

                // 2. Sla elk gerecht op in gerecht_in_bestelling
                items.forEach(item => {

                    db.run(
                        `INSERT INTO gerecht_in_bestelling 
                        (bestelling_id, gerechten_id, aantal)
                        VALUES (?, ?, ?)`,
                        [bestellingId, item.id, item.aantal || 1]
                    );

                    db.run(
                        `INSERT INTO bestelling_extras 
                        (bestelling_id, gerechten_id, groenten, sauzen, opmerking)
                        VALUES (?, ?, ?, ?, ?)`,
                        [
                            bestellingId,
                            item.id,
                            JSON.stringify(item.groenten || []),
                            JSON.stringify(item.sauzen || []),
                            item.opmerking || ""
                        ]
                    );

                });
            }
        );

        // 3. Stripe session
        const line_items = items.map((item) => ({
            price_data: {
                currency: "eur",
                product_data: { name: item.naam },
                unit_amount: Math.round(item.prijs * 100)
            },
            quantity: item.aantal || 1
        }));

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items,
            success_url: `${domain}/success.html`,
            cancel_url: `${domain}/cancel.html`
        });

        return res.json({ url: session.url });

    } catch (error) {
        console.error("Stripe error:", error);
        return res.status(500).json({ error: "Betaling mislukt" });
    }
});

//haalt de bestellingen op uit de database
app.get("/bestelling", (req, res) => {

    db.all(`
SELECT 
    b.id AS bestelling_id,
    b.naam,
    b.betaalmethode,
    b.totale_prijs,
    b.toestand,
    b.datum,

    g.id AS gerechten_id,
    g.naam AS broodje,
    gib.aantal,

    be.groenten,
    be.sauzen,
    be.opmerking

FROM bestelling b
JOIN gerecht_in_bestelling gib ON gib.bestelling_id = b.id
JOIN gerechten g ON g.id = gib.gerechten_id
LEFT JOIN bestelling_extras be 
    ON be.bestelling_id = b.id 
    AND be.gerechten_id = g.id
ORDER BY b.id DESC
`,
        [],
        (err, rows) => {
            if (err) {
                console.log(err.message);
                return res.status(500).json(err);
            }
            res.json(rows);
        });

});

//zorgt ervoor dat de bestelling als klaar kan worden aangeduid, ook in de database
app.patch("/bestelling/:id/klaar", (req, res) => {

    console.log("=> KLAAR REQUEST:", req.params.id);

    db.run(
        "UPDATE bestelling SET toestand = 'klaar' WHERE id = ?",
        [req.params.id],
        function (err) {
            if (err) {
                console.log("SQL ERROR:", err.message);
                return res.status(500).json(err);
            }

            res.json({ success: true });
        }
    );
});

//zorgt ervoor dat gerechten terug verwijderd kunnen worden
app.delete("/broodjes/:id", (req, res) => {
    db.run(
        "DELETE FROM gerechten WHERE id = ?",
        [req.params.id],
        function (err) {
            if (err) {
                console.log("BROODJE DELETE ERROR:", err.message);
                return res.status(500).json(err);
            }

            res.json({ success: true });
        }
    );
});

//zorgt ervoor dat bestellingen verwijderd kunnen worden
app.delete("/bestelling/:id", (req, res) => {
    db.run(
        "DELETE FROM bestelling WHERE id = ?",
        [req.params.id],
        function (err) {
            if (err) {
                console.log("BESTELLING DELETE ERROR:", err.message);
                return res.status(500).json(err);
            }

            res.json({ success: true });
        }
    );
});

//nieuw broodje te maken
app.put("/broodjes/:id", (req, res) => {

    const { naam, beschrijving, prijs, categorieen_id } = req.body;

    db.run(
        `UPDATE gerechten
         SET naam = ?,
             beschrijving = ?,
             prijs = ?,
             categorieen_id = ?
         WHERE id = ?`,
        [
            naam,
            beschrijving,
            prijs,
            categorieen_id,
            req.params.id
        ],
        function (err) {

            if (err) {
                console.log("UPDATE ERROR:", err.message);
                return res.status(500).json({ error: err.message });
            }

            res.json({ success: true });
        }
    );
});

//server
app.listen(PORT, () => {
    console.log(`Server draait op http://localhost:${PORT}`);
});