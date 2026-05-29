// Inicialização do Mapa
const map = L.map('map-container').setView([-15.7801, -47.9292], 5); // Centralizado no Brasil

// Camadas do Mapa
const baseLayers = {
    "Modo Escuro (CartoDB)": L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        attribution: '&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }),
    "Mapa de Ruas (OSM)": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map), // Padrão
    "Satélite (Esri)": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    })
};

L.control.layers(baseLayers).addTo(map);

// Ícones personalizados
const greenIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const blueIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Variáveis globais
let routingControl = null;
let waypointCounter = 0;
const waypoints = {}; // Armazena os objetos de waypoint do Leaflet.Routing.Machine
const markers = {}; // Armazena os marcadores do Leaflet

// Elementos do DOM
const originInput = document.getElementById('origin-input');
const destinationInput = document.getElementById('destination-input');
const addWaypointBtn = document.getElementById('add-waypoint');
const waypointsContainer = document.getElementById('waypoints-container');
const calculateRouteBtn = document.getElementById('calculate-route');
const totalDistanceSpan = document.getElementById('total-distance');
const totalTimeSpan = document.getElementById('total-time');
const routeInstructionsDiv = document.getElementById('route-instructions');

// Função de debounce para autocomplete
function debounce(func, delay) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

// Função de Geocodificação (busca de endereço) usando Nominatim
async function geocodeAddress(address) {
    const userAgent = 'MeuAppDeRotasEscolar/1.0 (https://github.com/seu-usuario/seu-repo)'; // Substitua com seu user-agent real e URL do projeto
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&addressdetails=1&limit=1`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': userAgent
            }
        });
        const data = await response.json();
        if (data && data.length > 0) {
            const result = data[0];
            return {
                lat: parseFloat(result.lat),
                lon: parseFloat(result.lon),
                display_name: result.display_name
            };
        }
    } catch (error) {
        console.error('Erro ao geocodificar endereço:', error);
    }
    return null;
}

// Sistema de fallback para geocodificação
async function geocodeAddressWithFallback(address) {
    let result = await geocodeAddress(address);
    if (result) return result;

    console.warn('Busca detalhada falhou, tentando fallback...');

    // Tentativa 1: "Rua, Cidade - Estado"
    const parts = address.split(',').map(p => p.trim());
    if (parts.length >= 2) {
        result = await geocodeAddress(`${parts[0]}, ${parts[parts.length - 1]}`);
        if (result) return result;
    }

    // Tentativa 2: "Cidade - Estado"
    if (parts.length >= 1) {
        result = await geocodeAddress(parts[parts.length - 1]);
        if (result) return result;
    }

    console.error('Todas as tentativas de geocodificação falharam.');
    return null;
}

// Função de Busca de CEP com ViaCEP
async function searchCep(cep) {
    const cleanedCep = cep.replace(/\D/g, ''); // Remove caracteres não numéricos
    if (cleanedCep.length !== 8) return null;

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanedCep}/json/`);
        const data = await response.json();
        if (!data.erro) {
            return `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}`;
        }
    } catch (error) {
        console.error('Erro ao buscar CEP:', error);
    }
    return null;
}

// Função para criar o autocomplete
function setupAutocomplete(inputElement) {
    let currentFocus;

    inputElement.addEventListener("input", debounce(async function (e) {
        const val = this.value;
        closeAllLists();
        if (!val) { return false; }
        currentFocus = -1;

        const autocompleteList = document.createElement("DIV");
        autocompleteList.setAttribute("id", this.id + "autocomplete-list");
        autocompleteList.setAttribute("class", "autocomplete-items");
        this.parentNode.appendChild(autocompleteList);

        if (val.length < 3) return; // Só busca após 3 caracteres

        // Tentar buscar por CEP primeiro
        const cepAddress = await searchCep(val);
        if (cepAddress) {
            const b = document.createElement("DIV");
            b.innerHTML = `<strong>CEP: ${val}</strong> - ${cepAddress}`;
            b.addEventListener("click", function (e) {
                inputElement.value = cepAddress;
                closeAllLists();
            });
            autocompleteList.appendChild(b);
        }

        const results = await geocodeAddress(val); // Usar geocodeAddress diretamente para autocomplete
        if (results) {
            const b = document.createElement("DIV");
            b.innerHTML = `<strong>${results.display_name.substr(0, val.length)}</strong>${results.display_name.substr(val.length)}`;
            b.addEventListener("click", function (e) {
                inputElement.value = results.display_name;
                closeAllLists();
            });
            autocompleteList.appendChild(b);
        }
    }, 400)); // Debounce de 400ms

    inputElement.addEventListener("keydown", function (e) {
        let x = document.getElementById(this.id + "autocomplete-list");
        if (x) x = x.getElementsByTagName("div");
        if (e.keyCode == 40) { // Seta para baixo
            currentFocus++;
            addActive(x);
        } else if (e.keyCode == 38) { // Seta para cima
            currentFocus--;
            addActive(x);
        } else if (e.keyCode == 13) { // Enter
            e.preventDefault();
            if (currentFocus > -1) {
                if (x) x[currentFocus].click();
            }
        }
    });

    function addActive(x) {
        if (!x) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].classList.add("autocomplete-active");
    }

    function removeActive(x) {
        for (let i = 0; i < x.length; i++) {
            x[i].classList.remove("autocomplete-active");
        }
    }

    function closeAllLists(elmnt) {
        const x = document.getElementsByClassName("autocomplete-items");
        for (let i = 0; i < x.length; i++) {
            if (elmnt != x[i] && elmnt != inputElement) {
                x[i].parentNode.removeChild(x[i]);
            }
        }
    }

    document.addEventListener("click", function (e) {
        closeAllLists(e.target);
    });
}

// Configurar autocomplete para os inputs iniciais
setupAutocomplete(originInput);
setupAutocomplete(destinationInput);

// Adicionar Parada
addWaypointBtn.addEventListener('click', () => {
    waypointCounter++;
    const waypointId = `waypoint-${waypointCounter}`;

    const inputGroup = document.createElement('div');
    inputGroup.classList.add('input-group');
    inputGroup.setAttribute('data-waypoint-id', waypointId);
    inputGroup.innerHTML = `
        <label for="${waypointId}-input">Parada ${waypointCounter}:</label>
        <input type="text" id="${waypointId}-input" placeholder="Digite o endereço da parada...">
        <button class="remove-waypoint-btn" data-waypoint-id="${waypointId}">&times;</button>
    `;
    waypointsContainer.appendChild(inputGroup);

    const newWaypointInput = document.getElementById(`${waypointId}-input`);
    setupAutocomplete(newWaypointInput);

    // Adicionar listener para remover parada
    inputGroup.querySelector('.remove-waypoint-btn').addEventListener('click', (e) => {
        const idToRemove = e.target.dataset.waypointId;
        document.querySelector(`[data-waypoint-id="${idToRemove}"]`).remove();
        delete waypoints[idToRemove];
        if (markers[idToRemove]) {
            map.removeLayer(markers[idToRemove]);
            delete markers[idToRemove];
        }
        // Recalcular rota se houver uma
        if (routingControl) {
            calculateRouteBtn.click();
        }
    });
});

// Calcular Rota
calculateRouteBtn.addEventListener('click', async () => {
    const originAddress = originInput.value;
    const destinationAddress = destinationInput.value;
    const intermediateWaypoints = [];

    // Coletar endereços das paradas intermediárias
    document.querySelectorAll('[id^="waypoint-"][id$="-input"]').forEach(input => {
        if (input.value) {
            intermediateWaypoints.push(input.value);
        }
    });

    if (!originAddress || !destinationAddress) {
        alert('Por favor, insira um endereço de origem e destino.');
        return;
    }

    const originCoords = await geocodeAddressWithFallback(originAddress);
    const destinationCoords = await geocodeAddressWithFallback(destinationAddress);

    if (!originCoords) {
        alert('Não foi possível encontrar a origem. Por favor, verifique o endereço.');
        return;
    }
    if (!destinationCoords) {
        alert('Não foi possível encontrar o destino. Por favor, verifique o endereço.');
        return;
    }

    const leafletWaypoints = [
        L.Routing.waypoint(L.latLng(originCoords.lat, originCoords.lon), originCoords.display_name),
    ];

    // Adicionar paradas intermediárias
    for (const address of intermediateWaypoints) {
        const coords = await geocodeAddressWithFallback(address);
        if (coords) {
            leafletWaypoints.push(L.Routing.waypoint(L.latLng(coords.lat, coords.lon), coords.display_name));
        } else {
            console.warn(`Não foi possível geocodificar a parada: ${address}`);
        }
    }

    leafletWaypoints.push(
        L.Routing.waypoint(L.latLng(destinationCoords.lat, destinationCoords.lon), destinationCoords.display_name)
    );

    // Remover marcadores antigos
    for (const key in markers) {
        map.removeLayer(markers[key]);
    }
    Object.keys(markers).forEach(key => delete markers[key]);

    // Adicionar novos marcadores
    markers['origin'] = L.marker([originCoords.lat, originCoords.lon], { icon: greenIcon }).addTo(map)
        .bindPopup(`<b>Origem:</b> ${originCoords.display_name}`);

    intermediateWaypoints.forEach(async (address, index) => {
        const coords = await geocodeAddressWithFallback(address);
        if (coords) {
            const waypointId = `waypoint-${Array.from(document.querySelectorAll('[id^="waypoint-"][id$="-input"]')).findIndex(input => input.value === address) + 1}`;
            markers[waypointId] = L.marker([coords.lat, coords.lon], { icon: blueIcon }).addTo(map)
                .bindPopup(`<b>Parada ${index + 1}:</b> ${coords.display_name}`);
        }
    });

    markers['destination'] = L.marker([destinationCoords.lat, destinationCoords.lon], { icon: redIcon }).addTo(map)
        .bindPopup(`<b>Destino:</b> ${destinationCoords.display_name}`);


    // Remover controle de rota existente, se houver
    if (routingControl) {
        map.removeControl(routingControl);
    }

    // Criar novo controle de rota
    routingControl = L.Routing.control({
        waypoints: leafletWaypoints,
        routeWhileDragging: true,
        showAlternatives: false,
        altLineOptions: {
            styles: [
                { color: 'black', opacity: 0.15, weight: 9 },
                { color: 'white', opacity: 0.8, weight: 6 },
                { color: 'blue', opacity: 0.5, weight: 2 }
            ]
        },
        createMarker: function (i, waypoint, n) {
            let icon = blueIcon; // Paradas intermediárias
            if (i === 0) {
                icon = greenIcon; // Origem
            } else if (i === n - 1) {
                icon = redIcon; // Destino
            }
            return L.marker(waypoint.latLng, { icon: icon }).bindPopup(waypoint.name);
        },
        language: 'pt', // Define o idioma para português
        router: L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1' // OSRM para roteamento
        })
    }).addTo(map);

    routingControl.on('routesfound', function (e) {
        const routes = e.routes;
        const summary = routes[0].summary;

        totalDistanceSpan.textContent = `${(summary.totalDistance / 1000).toFixed(2)} km`;
        totalTimeSpan.textContent = `${formatTime(summary.totalTime)}`;

        // Exibir instruções de rota
        routeInstructionsDiv.innerHTML = '<h3>Instruções Detalhadas:</h3><ul></ul>';
        const instructionsList = routeInstructionsDiv.querySelector('ul');

        routes[0].instructions.forEach(instruction => {
            const li = document.createElement('li');
            li.textContent = instruction.text;
            instructionsList.appendChild(li);
        });
    });

    routingControl.on('routingerror', function (e) {
        console.error('Erro de roteamento:', e);
        alert('Não foi possível calcular a rota. Verifique os endereços e tente novamente.');
        totalDistanceSpan.textContent = '--';
        totalTimeSpan.textContent = '--';
        routeInstructionsDiv.innerHTML = '';
    });
});

// Função para formatar o tempo
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    let timeString = '';
    if (hours > 0) {
        timeString += `${hours}h `;
    }
    if (minutes > 0) {
        timeString += `${minutes}min `;
    }
    if (remainingSeconds > 0 || timeString === '') { // Garante que pelo menos segundos sejam mostrados se o tempo for muito curto
        timeString += `${remainingSeconds}s`;
    }
    return timeString.trim();
}