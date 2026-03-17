function placeOrder() {
    const name = document.getElementById("customerName").value.trim();
    if (!name) {
        alert("Gelieve je naam in te vullen!");
        return;
    }

    const orderItems = [];
    document.querySelectorAll("#orderList li").forEach(li => {
        orderItems.push(li.innerText.replace("Verwijderen","").trim());
    });

    if (orderItems.length === 0) {
        alert("Je hebt nog geen broodjes toegevoegd!");
        return;
    }

    const total = parseFloat(document.getElementById("total").textContent);

    const data = {
        naam: name,
        broodje: orderItems.join(" | "),
        broodType: "-", 
        groenten: [],   
        saus: "-",
        extras: [],
        opmerking: "-",
        totaal: total.toFixed(2)
    };

    fetch("https://script.google.com/macros/s/AKfycbyEZU02atMlebqH5GId5I4QIhfmoxBmzMOYWFeTOSRbf6LuFn0WdYp2cErJJq7or6si/exec://script.google.com/macros/s/AKfycbzlpPK4mzBy-KLVLMRgb5v3TlA63E46UZtEe_dVphAP7fA4_9M1hKUgvVKavW5DCBHg/exec", {  // Vervang dit door de Apps Script Webapp URL
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" }
    })
    .then(res => res.json())
    .then(res => {
        alert("Bestelling succesvol geplaatst! De bazin ontvangt een melding.");
        document.getElementById("orderList").innerHTML = "";
        document.getElementById("total").textContent = "0.00";
        document.getElementById("customerName").value = "";
    })
    .catch(err => {
        alert("Er ging iets mis. Probeer opnieuw.");
        console.error(err);
    });
}
