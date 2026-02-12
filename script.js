// 1. Configuración de Supabase
const SUPABASE_URL = 'https://jwtruolnvepievxheuyh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8QmGDNmTJSCnnQT22-SSBA_9UFzR0YN';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const SUPABASE_ENABLED = true;
const DEMO_RUTAS = [
    {
        id: 101,
        lat: -12.0459,
        lng: -77.0325,
        fecha: '2026-02-05',
        descripcion: 'Av. Abancay 100'
    },
    {
        id: 102,
        lat: -12.0478,
        lng: -77.0372,
        fecha: '2026-02-06',
        descripcion: 'Jiron Junin 450'
    },
    {
        id: 103,
        lat: -12.0508,
        lng: -77.0421,
        fecha: '2026-02-07',
        descripcion: 'Av. Tacna 350'
    }
];

// 2. Inicialización del Mapa
const map = L.map('map', {
    zoomControl: false 
}).setView([-12.0464, -77.0428], 13);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Zoom abajo a la izquierda para no estorbar al buscador
L.control.zoom({ position: 'bottomleft' }).addTo(map);

// --- BUSCADOR (GEOCODER) ---
const geocoder = L.Control.geocoder({
    defaultMarkGeocode: false,
    placeholder: "Busca una calle o lugar...",
    errorMessage: "No se encontró el lugar.",
    position: 'topleft' 
})
.on('markgeocode', function(e) {
    const latlng = e.geocode.center;
    map.setView(latlng, 17);
    alert("¡Lugar encontrado! Ahora haz clic exacto con tu puntero negro.");
})
.addTo(map);

// --- COMPRESIÓN DE IMAGEN ---
async function comprimirImagen(archivo) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(archivo);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1000; 
                let width = img.width;
                let height = img.height;
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => { resolve(blob); }, 'image/jpeg', 0.7); 
            };
        };
    });
}
// 3. Capturar clic y abrir Modal
let ubicacionActual = null; // IMPORTANTE: Se inicia en null
let controlRuta = null; // Control de routing
let rutaVisible = false; // Estado de visibilidad de la ruta
let marcadoresNumeros = []; // Marcadores con números de secuencia
let puntosRutaAprobados = []; // Lista ordenada de puntos aprobados
let puntosSeleccionados = new Set(); // IDs seleccionados para la ruta
let modoAgregarRuta = false; // Modo para agregar ruta sin formulario
let modoFormulario = 'pinta'; // 'pinta' | 'ruta'
let rutaInicioTemporal = null;
let rutaFinTemporal = null;
let rutaListaTemporal = false;
let controlesRutasVisibles = [];
let rutaPuntosTemporales = [];
let lineaRutaTemporal = null;
let marcadorInicioTemporal = null;
let marcadorFinTemporal = null;
let rutaGruposActuales = {};
let pintasRegistradas = [];
let panelModo = null;
let modoAgregarPintas = false;
let pintasVisibles = false;
let marcadoresPintas = [];
let pintasDesdeRuta = false;
let rutasDesdePintas = false;
let modoAnterior = null;

function ocultarPanelRutas() {
    const panel = document.getElementById('panel-puntos');
    if (panel) {
        panel.classList.remove('panel-visible');
    }
}

function setBotonRuta(visible) {
    const btnRuta = document.getElementById('btn-toggle-ruta');
    if (!btnRuta) return;
    if (modoAgregarRuta) {
        btnRuta.textContent = 'Cancelar';
        return;
    }
    btnRuta.textContent = visible ? 'Salir' : 'Rutas';
    // Al hacer visible=true, el botón dice 'Salir'.
    // Si el usuario presiona 'Salir', debe volver a la vista principal de botones.
    btnRuta.onclick = function() {
        if (btnRuta.textContent === 'Salir') {
            // Restaurar vista principal
            setBotonRuta(false);
            setBotonPintas(false);
            setBotonAmbosVisible(true);
            mostrarOpcionesRuta(false);
            mostrarOpcionesPintas(false);
            setBotonesPrincipalesVisible(true, true);
            setPanelVisible(false);
            panelModo = null;
        } else {
            toggleRuta();
        }
    };
}

function setBotonPintas(visible) {
    const btnPintas = document.getElementById('btn-toggle-pintas');
    if (!btnPintas) return;
    if (modoAgregarPintas) {
        btnPintas.textContent = 'Cancelar';
        return;
    }
    btnPintas.textContent = visible ? 'Salir' : 'Pintas';
}

function setCancelarRutaTopVisible(visible, etiqueta) {
    const btnCancelarTop = document.getElementById('btn-cancelar-ruta-top');
    if (!btnCancelarTop) return;
    btnCancelarTop.classList.add('control-oculto');
}

function setBotonesPrincipalesVisible(mostrarRuta, mostrarPintas) {
    const btnRuta = document.getElementById('btn-toggle-ruta');
    const btnPintas = document.getElementById('btn-toggle-pintas');
    if (btnRuta) btnRuta.classList.toggle('control-oculto', !mostrarRuta);
    if (btnPintas) btnPintas.classList.toggle('control-oculto', !mostrarPintas);
}

function setBotonAmbosVisible(visible) {
    const btnAmbos = document.getElementById('btn-toggle-ambos');
    if (!btnAmbos) return;
    btnAmbos.classList.toggle('control-oculto', !visible);
}

function mostrarOpcionesRuta(visible) {
    const opciones = document.getElementById('control-ruta-opciones');
    if (!opciones) return;
    opciones.classList.toggle('control-oculto', !visible);
}

function setOpcionesRutaSoloCancelar(soloCancelar) {
    const btnAdd = document.getElementById('btn-toggle-add');
    const btnMostrarPintas = document.getElementById('btn-mostrar-pintas');
    if (btnAdd) btnAdd.classList.toggle('control-oculto', soloCancelar);
    if (btnMostrarPintas) btnMostrarPintas.classList.toggle('control-oculto', soloCancelar);
}

function setOpcionesPintasSoloCancelar(soloCancelar) {
    const btnAddPintas = document.getElementById('btn-activar-pintas');
    const btnMostrarRutas = document.getElementById('btn-mostrar-rutas');
    if (btnAddPintas) btnAddPintas.classList.toggle('control-oculto', soloCancelar);
    if (btnMostrarRutas) btnMostrarRutas.classList.toggle('control-oculto', soloCancelar);
}

function mostrarOpcionesPintas(visible) {
    const opciones = document.getElementById('control-pintas-extra');
    if (!opciones) return;
    opciones.classList.toggle('control-oculto', !visible);
}

function bloquearAcciones(activo, origen) {
    const btnRuta = document.getElementById('btn-toggle-ruta');
    const btnPintas = document.getElementById('btn-toggle-pintas');
    const btnAmbos = document.getElementById('btn-toggle-ambos');
    const btnAddRuta = document.getElementById('btn-toggle-add');
    const btnMostrarPintas = document.getElementById('btn-mostrar-pintas');
    const btnMostrarRutas = document.getElementById('btn-mostrar-rutas');
    const btnAddPintas = document.getElementById('btn-activar-pintas');
    if (btnRuta) btnRuta.disabled = activo && origen !== 'ruta';
    if (btnPintas) btnPintas.disabled = activo && origen !== 'pintas';
    if (btnAmbos) btnAmbos.disabled = activo;
    if (btnAddRuta) btnAddRuta.disabled = activo || origen === 'pintas';
    if (btnMostrarPintas) btnMostrarPintas.disabled = activo;
    if (btnMostrarRutas) btnMostrarRutas.disabled = activo;
    if (btnAddPintas) btnAddPintas.disabled = activo || origen === 'ruta';
}

function setPanelInfo(titulo, ayuda) {
    const tituloEl = document.querySelector('.panel-titulo');
    const ayudaEl = document.querySelector('.panel-ayuda');
    if (tituloEl) tituloEl.textContent = titulo;
    if (ayudaEl) ayudaEl.textContent = ayuda;
}

function setPanelListaVisible(modo) {
    const listaRutas = document.getElementById('lista-rutas');
    const listaPintas = document.getElementById('lista-pintas');
    const mostrarRutas = modo === 'rutas' || modo === 'ambos';
    const mostrarPintas = modo === 'pintas' || modo === 'ambos';
    if (listaRutas) listaRutas.classList.toggle('lista-oculta', !mostrarRutas);
    if (listaPintas) listaPintas.classList.toggle('lista-oculta', !mostrarPintas);
}

function registrarMarcadorPinta(marcador) {
    marcadoresPintas.push(marcador);
    if (!pintasVisibles && map.hasLayer(marcador)) {
        map.removeLayer(marcador);
    }
}

function mostrarPintasMapa(visible) {
    pintasVisibles = visible;
    marcadoresPintas.forEach((marcador) => {
        if (visible) {
            if (!map.hasLayer(marcador)) {
                marcador.addTo(map);
            }
        } else if (map.hasLayer(marcador)) {
            map.removeLayer(marcador);
        }
    });
}

function actualizarVisibilidadPintas() {
    const mostrar = panelModo === 'pintas' || panelModo === 'ambos' || pintasDesdeRuta;
    mostrarPintasMapa(mostrar);
}

function cerrarPanelRutas() {
    limpiarRutasVisibles();
    desactivarModoAgregar();
    setBotonAddHabilitado(true);
    setOpcionesRutaSoloCancelar(false);
    setOpcionesPintasSoloCancelar(false);
    panelModo = null;
    pintasDesdeRuta = false;
    rutasDesdePintas = false;
    setBotonPintas(false);
    setBotonRuta(false);
    mostrarOpcionesRuta(false);
    mostrarOpcionesPintas(false);
    modoAgregarPintas = false;
    bloquearAcciones(false);
    setBotonesPrincipalesVisible(true, true);
    setBotonAmbosVisible(true);
    setBotonMostrarPintas(false);
    setBotonMostrarRutas(false);
    setBotonAmbosTexto(false);
    setCancelarRutaTopVisible(false, 'Cancelar');
    setCancelarPintasTexto('Cancelar');
}

function setBotonMostrarPintas(cancelar) {
    const btnMostrar = document.getElementById('btn-mostrar-pintas');
    if (!btnMostrar) return;
    btnMostrar.textContent = cancelar ? 'Dejar de mostrar' : 'Mostrar pintas';
}

function setBotonAmbosTexto(activo) {
    const btnAmbos = document.getElementById('btn-toggle-ambos');
    if (!btnAmbos) return;
    btnAmbos.textContent = activo ? 'Dejar de mostrar' : 'Mostrar ambos';
}

function setBotonMostrarRutas(cancelar) {
    const btnMostrar = document.getElementById('btn-mostrar-rutas');
    if (!btnMostrar) return;
    btnMostrar.textContent = cancelar ? 'Dejar de mostrar' : 'Mostrar rutas';
}

function setCancelarPintasTexto(texto) {
    const btnCancelarPintas = document.getElementById('btn-cancelar-pintas');
    if (!btnCancelarPintas) return;
    btnCancelarPintas.textContent = texto;
}

function setBotonMostrarRutasVisible(visible) {
    const btnMostrar = document.getElementById('btn-mostrar-rutas');
    if (!btnMostrar) return;
    btnMostrar.classList.toggle('control-oculto', !visible);
}

function setBotonCancelarPintasVisible(visible) {
    const btnCancelar = document.getElementById('btn-cancelar-pintas');
    if (!btnCancelar) return;
    btnCancelar.classList.toggle('control-oculto', !visible);
}

function setBotonAgregarPintasVisible(visible) {
    const btnAgregarPintas = document.getElementById('btn-activar-pintas');
    if (!btnAgregarPintas) return;
    btnAgregarPintas.classList.toggle('control-oculto', !visible);
}

function setBotonAddHabilitado(habilitado) {
    const btnAdd = document.getElementById('btn-toggle-add');
    if (!btnAdd) return;
    btnAdd.disabled = !habilitado;
}

function setPanelVisible(visible) {
    const panel = document.getElementById('panel-puntos');
    if (!panel) return;
    panel.classList.toggle('panel-visible', visible);
}

function setControlesBloqueados(activo) {
    const contenedor = document.getElementById('control-ruta');
    if (!contenedor) return;
    contenedor.classList.toggle('controles-bloqueados', activo);
}

function limpiarCapasRutas() {
    controlesRutasVisibles.forEach((layer) => map.removeLayer(layer));
    controlesRutasVisibles = [];
    marcadoresNumeros.forEach((marcador) => map.removeLayer(marcador));
    marcadoresNumeros = [];
    controlRuta = null;
    rutaVisible = false;
}


function limpiarRutasVisibles() {
    limpiarCapasRutas();
    setBotonRuta(false);
    ocultarPanelRutas();
    if (panelModo === 'rutas') {
        panelModo = null;
    }
}

map.on('click', function(e) {
    if (modoAgregarRuta) {
        const ubicacionRuta = { lat: e.latlng.lat, lng: e.latlng.lng };
        manejarClicksRuta(ubicacionRuta);
        return;
    }

    if (!modoAgregarPintas) {
        return;
    }

    // Aquí capturamos la latitud y longitud del clic
    ubicacionActual = { lat: e.latlng.lat, lng: e.latlng.lng };
    setModoFormulario('pinta');

    const modal = document.getElementById('modal-formulario');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('formulario-zona').reset();
        setControlesBloqueados(true);

        // Establecer fecha de hoy por defecto
        const hoy = new Date().toISOString().split('T')[0];
        document.getElementById('fecha').value = hoy;
        rutasDesdePintas = false;

        document.getElementById('nombre-archivo').textContent = 'Ningún archivo seleccionado';
    }
});

// Evitar que se abra el modal sin ubicación al hacer clic en otros elementos
document.addEventListener('click', function(e) {
    // Evitar abrir modal si no hay ubicación
    if (!ubicacionActual && e.target.id === 'modal-formulario') {
        e.target.style.display = 'none';
    }
});

// Cerrar Modal - Función global
function cerrarModal() {
    const modal = document.getElementById('modal-formulario');
    if (modal) {
        modal.style.display = 'none';
    }
    document.getElementById('formulario-zona').reset();
    document.getElementById('nombre-archivo').textContent = 'Ningún archivo seleccionado';
    setControlesBloqueados(false);
    // NO borrar ubicacionActual aquí - se borra solo cuando se hace clic en otro punto del mapa
}

// Cerrar modal cuando se presiona Escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        cerrarModal();
    }
})

// 4. Cargar Puntos Aprobados y Pendientes
async function cargarPuntosAprobados() {
    if (!SUPABASE_ENABLED) return;
    const { data, error } = await _supabase.from('puntos').select('*');
    if (error) return;
    if (data) {
        pintasRegistradas = [];
        data.forEach(p => {
            const lat = normalizarNumero(p.latitud);
            const lng = normalizarNumero(p.longitud);
            if (lat === null || lng === null) {
                return;
            }
            pintasRegistradas.push({
                id: p.id,
                lat,
                lng,
                fecha: p.fecha_registro,
                descripcion: p.descripcion,
                estado: p.estado
            });
            if (p.estado === 'aprobado') {
                const fechaFormateada = p.fecha_registro ? formatearFecha(p.fecha_registro) : 'Sin fecha';
                const fotoHtml = p.foto_url ? `<img src="${p.foto_url}" width="150px" style="border-radius:8px; margin:10px 0;">` : '';
                
                const marcador = L.marker([lat, lng]).addTo(map)
                .bindPopup(`<div style="text-align:center;">
                    <b style="color:#27ae60; font-size:1.1em;">${p.descripcion}</b>
                    <br><small style="color:#666; font-weight:bold;">📅 ${fechaFormateada}</small>
                    <br><small style="color:#999;">Por: ${p.nombre_persona}</small>
                    ${fotoHtml}
                </div>`);
                registrarMarcadorPinta(marcador);
            } else if (p.estado === 'pendiente') {
                const fechaFormateada = p.fecha_registro ? formatearFecha(p.fecha_registro) : 'Sin fecha';
                const fotoHtml = p.foto_url ? `<img src="${p.foto_url}" width="150px" style="border-radius:8px; margin:10px 0;">` : '';
                
                const marcador = L.marker([lat, lng], {
                    opacity: 0.5,
                    title: 'Pendiente de validación'
                }).addTo(map)
                .bindPopup(`<div style="text-align:center; opacity:0.9;">
                    <b style="color:#f39c12;">⏳ ${p.descripcion}</b>
                    <br><small style="color:#666;">📅 ${fechaFormateada}</small>
                    <br><small style="color:#666;">Subido por: ${p.nombre_persona}</small>
                    ${fotoHtml}
                    <br><small style="color:#f39c12; font-weight:bold;">En revisión</small>
                </div>`);
                registrarMarcadorPinta(marcador);
            }
        });
        if (panelModo === 'pintas') {
            renderListaPintas();
        }
    }
}

async function cargarRutasAprobadas() {
    if (!SUPABASE_ENABLED) return;
    const { data, error } = await _supabase.from('rutas').select('*');
    if (error) return;
    if (data) {
        const rutasOrdenadas = [];
        const grupos = {};

        data.forEach(r => {
            const estado = normalizarEstado(r.estado);
            const base = obtenerDescripcionBase(r.descripcion);
            const fecha = r.fecha_registro || '';
            const clave = `${base}|${fecha}`;
            if (!grupos[clave]) {
                grupos[clave] = {
                    puntos: [],
                    estados: new Set()
                };
            }
            grupos[clave].puntos.push(r);
            grupos[clave].estados.add(estado);
        });

        Object.values(grupos).forEach((grupo) => {
            if (!grupo.estados.has('aprobado')) {
                return;
            }
            grupo.puntos.forEach((r) => {
                const lat = normalizarNumero(r.latitud);
                const lng = normalizarNumero(r.longitud);
                if (lat === null || lng === null) {
                    return;
                }
                rutasOrdenadas.push({
                    id: r.id,
                    lat,
                    lng,
                    fecha: r.fecha_registro,
                    descripcion: r.descripcion
                });
            });
        });

        // Ordenar rutas por fecha
        rutasOrdenadas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        puntosRutaAprobados = rutasOrdenadas;
        puntosSeleccionados = new Set(rutasOrdenadas.map(r => r.id));
        renderListaPuntos();
    }
}

// Función para formatear fecha
function formatearFecha(fechaString) {
    if (!fechaString) return 'Sin fecha';
    const fecha = new Date(fechaString + 'T00:00:00');
    const opciones = { year: 'numeric', month: 'long', day: 'numeric' };
    return fecha.toLocaleDateString('es-ES', opciones);
}

function escapeHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto || '';
    return div.innerHTML;
}

function normalizarNumero(valor) {
    if (valor === null || valor === undefined) return null;
    const texto = String(valor).replace(',', '.').trim();
    if (!texto) return null;
    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : null;
}

function normalizarEstado(estado) {
    return String(estado || '').trim().toLowerCase();
}

function obtenerDescripcionBase(descripcion) {
    const texto = descripcion || '';
    const partes = texto.split(/ \| (Coord|Inicio|Punto inicio|Direccion|Coordenada):/);
    const base = partes[0].replace(/\s*\(\d+\)\s*$/, '').trim();
    return base;
}

function normalizarDescripcionRuta(descripcion) {
    const texto = descripcion || '';
    const base = texto.split(' | ')[0].replace(/\s*\(\d+\)\s*$/, '').trim();
    const direccionMatch = texto.match(/\bDireccion:\s*([^|]+)/i);
    const coordenadaMatch = texto.match(/\bCoordenada:\s*([^|]+)/i);
    const partes = [base];
    if (direccionMatch && direccionMatch[1]) {
        partes.push(`Direccion: ${direccionMatch[1].trim()}`);
    }
    if (coordenadaMatch && coordenadaMatch[1]) {
        partes.push(`Coordenada: ${coordenadaMatch[1].trim()}`);
    }
    return partes.join(' | ');
}

async function obtenerDireccion(lat, lng) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
        const res = await fetch(url, {
            headers: { 'Accept-Language': 'es' }
        });
        if (!res.ok) return '';
        const data = await res.json();
        if (!data) return '';
        const address = data.address || {};
        const calle = address.road || address.pedestrian || address.path || address.residential || '';
        const numero = address.house_number ? ` ${address.house_number}` : '';
        if (calle) return `${calle}${numero}`;
        if (data.display_name) {
            return data.display_name.split(',')[0].trim();
        }
        return '';
    } catch (err) {
        return '';
    }
}

function formatearDescripcionUbicacion(descripcion, lat, lng, direccion) {
    const latFmt = Number(lat).toFixed(6);
    const lngFmt = Number(lng).toFixed(6);
    const partes = [descripcion || ''];
    partes.push(`Coord: ${latFmt}, ${lngFmt}`);
    if (direccion) {
        partes.push(`Dir: ${direccion}`);
    }
    return partes.filter(Boolean).join(' | ');
}

function formatearDescripcionRuta(descripcion, inicio, dirInicio) {
    const inicioFmt = `${Number(inicio.lat).toFixed(6)}, ${Number(inicio.lng).toFixed(6)}`;
    const partes = [descripcion || 'Ruta sin descripcion'];
    if (dirInicio) {
        partes.push(`Direccion: ${dirInicio}`);
    }
    partes.push(`Coordenada: ${inicioFmt}`);
    return partes.filter(Boolean).join(' | ');
}

function renderListaPuntos() {
    const contenedor = document.getElementById('lista-rutas');
    if (!contenedor) return;

    contenedor.innerHTML = '';
    rutaGruposActuales = {};
    puntosRutaAprobados.forEach((p) => {
        const baseDescripcion = obtenerDescripcionBase(p.descripcion);
        const clave = `${baseDescripcion}|${p.fecha || ''}`;
        if (!rutaGruposActuales[clave]) {
            rutaGruposActuales[clave] = {
                descripcion: baseDescripcion || 'Ruta sin descripcion',
                fecha: p.fecha || '',
                ids: []
            };
        }
        rutaGruposActuales[clave].ids.push(p.id);
    });

    Object.entries(rutaGruposActuales).forEach(([clave, grupo]) => {
        const marcado = grupo.ids.every((id) => puntosSeleccionados.has(id));
        const item = document.createElement('label');
        item.className = 'punto-item';
        item.innerHTML = `
            <input type="checkbox" data-key="${escapeHtml(clave)}" ${marcado ? 'checked' : ''}>
            <span>
                <span class="punto-nombre">${escapeHtml(grupo.descripcion)}</span>
                <span class="punto-fecha">${formatearFecha(grupo.fecha)}</span>
            </span>
        `;
        contenedor.appendChild(item);
    });
}

function renderListaPintas() {
    const contenedor = document.getElementById('lista-pintas');
    if (!contenedor) return;

    if (panelModo !== 'ambos') {
        setPanelListaVisible('pintas');
    }

    const ordenadas = pintasRegistradas.slice().sort((a, b) => {
        const fechaA = a.fecha ? new Date(a.fecha) : new Date(0);
        const fechaB = b.fecha ? new Date(b.fecha) : new Date(0);
        return fechaB - fechaA;
    });

    contenedor.innerHTML = '';
    if (ordenadas.length === 0) {
        setPanelInfo('Pintas', 'No hay pintas registradas.');
        return;
    }

    setPanelInfo('Pintas', 'Pintas creadas.');
    ordenadas.forEach((p) => {
        const item = document.createElement('div');
        item.className = 'punto-item';
        item.innerHTML = `
            <span>
                <span class="punto-nombre">${escapeHtml(p.descripcion || 'Sin descripcion')}</span>
                <span class="punto-fecha">${formatearFecha(p.fecha)}</span>
            </span>
        `;
        contenedor.appendChild(item);
    });
}
document.addEventListener('change', function(e) {
    if (e.target && e.target.matches('#lista-rutas input[type="checkbox"]')) {
        const clave = e.target.getAttribute('data-key');
        const grupo = rutaGruposActuales[clave];
        if (grupo && grupo.ids) {
            if (e.target.checked) {
                grupo.ids.forEach((id) => puntosSeleccionados.add(id));
            } else {
                grupo.ids.forEach((id) => puntosSeleccionados.delete(id));
            }
        }
        if (panelModo === 'rutas' || panelModo === 'ambos' || rutasDesdePintas) {
            construirRutaSeleccionada();
        }
    }
});

// 5. Subir Foto
async function subirFoto(archivoOptimizado) {
    const nombreArchivo = `${Date.now()}_calistenia.jpg`;
    const { data, error } = await _supabase.storage.from('fotos').upload(nombreArchivo, archivoOptimizado);
    if (error) throw error;
    const { data: urlData } = _supabase.storage.from('fotos').getPublicUrl(nombreArchivo);
    return urlData.publicUrl;
}

// 6. Manejo del Formulario (DOMContentLoaded para asegurar que existan los IDs)
document.addEventListener('DOMContentLoaded', function() {
    // Manejador del input de archivo
    const fotoInput = document.getElementById('foto');
    if (fotoInput) {
        fotoInput.addEventListener('change', function(e) {
            const archivo = e.target.files[0];
            const nombreArchivSpan = document.getElementById('nombre-archivo');
            
            if (archivo) {
                nombreArchivSpan.innerHTML = `
                    <span style="color: #27ae60; font-weight: bold;">✓ ${archivo.name}</span>
                    <br>
                    <small style="color: #999; margin-top: 5px; display: block;">${(archivo.size / 1024).toFixed(2)} KB</small>
                    <button type="button" style="margin-top: 10px; padding: 5px 10px; background: #e67e22; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 0.85em;" onclick="cambiarImagen()">Cambiar imagen</button>
                `;
            } else {
                nombreArchivSpan.textContent = 'Ningún archivo seleccionado';
            }
        });
    }

    const form = document.getElementById('formulario-zona');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // VERIFICACIÓN DE SEGURIDAD PARA EVITAR EL ERROR DE NULL
            const esRuta = modoFormulario === 'ruta';
            if (esRuta) {
                const puntosRuta = obtenerWaypointsTemporal();
                if (puntosRuta.length < 2) {
                    alert('❌ Error: Selecciona 2 puntos para la ruta antes de continuar');
                    return;
                }
            } else if (!ubicacionActual || !ubicacionActual.lat || !ubicacionActual.lng) {
                alert('❌ Error: No se detectó la ubicación.\n\nPor favor:\n1. Cierra esta ventana\n2. Haz clic exacto en el mapa donde desees registrar la zona\n3. Vuelve a llenar el formulario');
                return;
            }

            const btnEnviar = document.querySelector('.btn-confirmar');
            const archivo = document.getElementById('foto').files[0];

            // Guardar datos antes de cerrar el modal
            const descripcion = document.getElementById('descripcion').value;
            const persona = document.getElementById('persona').value;
            const fecha = document.getElementById('fecha').value;
            const tipoAnuncio = document.getElementById('tipoAnuncio').value;

            if (modoFormulario === 'pinta' && !tipoAnuncio) {
                alert('⚠️ Selecciona el tipo de anuncio');
                return;
            }

            // Cerrar modal del formulario INMEDIATAMENTE
            cerrarModal();
            
            // Mostrar modal de carga INMEDIATAMENTE
            mostrarCarga();

            try {
                let direccionPinta = '';
                if (modoFormulario === 'pinta') {
                    direccionPinta = await obtenerDireccion(ubicacionActual.lat, ubicacionActual.lng);
                }

                if (!SUPABASE_ENABLED) {
                    const urlLocal = archivo ? URL.createObjectURL(archivo) : null;

                    setTimeout(() => {
                        mostrarCheck();
                    }, 1000);

                    setTimeout(async () => {
                        cerrarModalExito();

                        if (modoFormulario === 'pinta') {
                            const descripcionFinal = formatearDescripcionUbicacion(
                                descripcion,
                                ubicacionActual.lat,
                                ubicacionActual.lng,
                                direccionPinta
                            );
                            agregarMarcadorPendiente(
                                ubicacionActual.lat,
                                ubicacionActual.lng,
                                descripcionFinal,
                                persona,
                                urlLocal
                            );
                            if (modoAgregarPintas) {
                                cancelarAgregarPintas();
                            }
                        } else {
                            const puntosRuta = obtenerWaypointsTemporal();
                            const inicioRuta = puntosRuta[0];
                            const dirInicio = inicioRuta ? await obtenerDireccion(inicioRuta.lat, inicioRuta.lng) : '';
                            if (inicioRuta) {
                                const descripcionFinal = formatearDescripcionRuta(
                                    descripcion,
                                    inicioRuta,
                                    dirInicio
                                );
                                agregarRutaLocal(
                                    inicioRuta.lat,
                                    inicioRuta.lng,
                                    descripcionFinal,
                                    fecha
                                );
                            }
                            finalizarRutaTemporal();
                        }
                    }, 2500);

                    return;
                }

                let urlFinal = null;
                if (archivo) {
                    const imagenComprimida = await comprimirImagen(archivo);
                    urlFinal = await subirFoto(imagenComprimida);
                }

                const payloadBase = {
                    nombre_persona: persona,
                    descripcion: descripcion,
                    fecha_registro: fecha,
                    estado: 'pendiente'
                };

                const tablaDestino = modoFormulario === 'ruta' ? 'rutas' : 'puntos';
                let insertError = null;

                if (modoFormulario === 'pinta') {
                    const descripcionFinal = formatearDescripcionUbicacion(
                        descripcion,
                        ubicacionActual.lat,
                        ubicacionActual.lng,
                        direccionPinta
                    );
                    const payload = {
                        ...payloadBase,
                        latitud: ubicacionActual.lat,
                        longitud: ubicacionActual.lng,
                        nombre_patrocinador: persona,
                        tipo_anuncio: tipoAnuncio,
                        descripcion: descripcionFinal
                    };
                    if (urlFinal) {
                        payload.foto_url = urlFinal;
                    }
                    ({ error: insertError } = await _supabase.from(tablaDestino).insert([payload]));
                } else {
                    const puntosRuta = obtenerWaypointsTemporal();
                    const inicioRuta = puntosRuta[0];
                    const dirInicio = inicioRuta ? await obtenerDireccion(inicioRuta.lat, inicioRuta.lng) : '';
                    const descripcionFinal = formatearDescripcionRuta(
                        descripcion,
                        inicioRuta,
                        dirInicio
                    );
                    const payload = {
                        ...payloadBase,
                        latitud: inicioRuta.lat,
                        longitud: inicioRuta.lng,
                        descripcion: descripcionFinal
                    };
                    if (urlFinal) {
                        payload.foto_url = urlFinal;
                    }
                    ({ error: insertError } = await _supabase.from(tablaDestino).insert([payload]));
                }

                if (!insertError) {
                    // Cambiar a check después de 1 segundo
                    setTimeout(() => {
                        mostrarCheck();
                    }, 1000);

                    // Cerrar modal y agregar marcador después de 2.5 segundos
                    setTimeout(() => {
                        cerrarModalExito();

                        if (modoFormulario === 'pinta') {
                            const descripcionFinal = formatearDescripcionUbicacion(
                                descripcion,
                                ubicacionActual.lat,
                                ubicacionActual.lng,
                                direccionPinta
                            );
                            agregarMarcadorPendiente(
                                ubicacionActual.lat,
                                ubicacionActual.lng,
                                descripcionFinal,
                                persona,
                                urlFinal
                            );
                            if (modoAgregarPintas) {
                                cancelarAgregarPintas();
                            }
                        } else {
                            finalizarRutaTemporal();
                        }
                    }, 2500);
                } else {
                    cerrarModalExito();
                    alert('❌ Error: ' + insertError.message);
                }
            } catch (err) {
                cerrarModalExito();
                alert("❌ Error: " + err.message);
            } finally {
                btnEnviar.disabled = false;
                btnEnviar.textContent = 'Enviar Registro';
            }
        });
    }
});

// Función para cambiar la imagen seleccionada
function cambiarImagen() {
    document.getElementById('foto').click();
}

// Función para mostrar el modal de carga (solo spinner)
function mostrarCarga() {
    const modalExito = document.getElementById('modal-exito');
    const spinnerCarga = document.getElementById('spinner-carga');
    const checkExito = document.getElementById('check-exito');
    
    modalExito.style.display = 'flex';
    spinnerCarga.style.display = 'block';
    checkExito.style.display = 'none';
}

// Función para mostrar el check (reemplaza el spinner)
function mostrarCheck() {
    const spinnerCarga = document.getElementById('spinner-carga');
    const checkExito = document.getElementById('check-exito');
    
    spinnerCarga.style.display = 'none';
    checkExito.style.display = 'block';
}

// Función para cerrar el modal de éxito
function cerrarModalExito() {
    const modalExito = document.getElementById('modal-exito');
    modalExito.style.display = 'none';
}

// Guardar ubicación y datos del último registro para el preview
let ultimoRegistro = {
    latitud: null,
    longitud: null,
    descripcion: null,
    nombre_persona: null,
    foto_url: null,
    marcador: null
};

// Función para agregar marcador de preview pendiente
function agregarMarcadorPendiente(latitud, longitud, descripcion, nombre_persona, foto_url) {
    const fechaHoy = formatearFecha(new Date().toISOString().split('T')[0]);
    const fotoHtml = foto_url ? `<img src="${foto_url}" width="150px" style="border-radius:8px; display:block; margin:10px auto;">` : '';
    
    // Crear marcador semitransparente
    const marcador = L.marker([latitud, longitud], {
        opacity: 0.5,
        title: 'Pendiente de validación'
    }).addTo(map)
    .bindPopup(`<div style="text-align:center; opacity:0.9;">
        <b style="color:#f39c12;">⏳ ${descripcion}</b>
        <br><small style="color:#666;">📅 ${fechaHoy}</small>
        <br><small style="color:#666;">Subido por: ${nombre_persona}</small>
        ${fotoHtml}
        <br><small style="color:#f39c12; font-weight:bold;">En revisión</small>
    </div>`);
    
    marcador.openPopup();
    registrarMarcadorPinta(marcador);
    
    // Guardar referencia del marcador
    ultimoRegistro = {
        latitud,
        longitud,
        descripcion,
        nombre_persona,
        foto_url,
        marcador
    };

    pintasRegistradas.push({
        id: Date.now(),
        lat: latitud,
        lng: longitud,
        fecha: new Date().toISOString().split('T')[0],
        descripcion,
        estado: 'pendiente'
    });
    if (panelModo === 'pintas') {
        renderListaPintas();
    }
}

// Función para dibujar/ocultar la ruta
function toggleRuta() {
    if (modoAgregarPintas) {
        return;
    }
    if (modoAgregarRuta) {
        cancelarRuta();
        return;
    }
    if (!puntosRutaAprobados) {
        return;
    }

    const veniaDeAmbos = panelModo === 'ambos';

    if (veniaDeAmbos) {
        panelModo = null;
        setBotonAmbosTexto(false);
        mostrarPintasMapa(false);
        limpiarCapasRutas();
    }

    const hayRutasVisibles = !veniaDeAmbos && (rutaVisible || controlesRutasVisibles.length > 0 || marcadoresNumeros.length > 0);
    if (hayRutasVisibles) {
        limpiarRutasVisibles();
        desactivarModoAgregar();
        setBotonAddHabilitado(true);
        panelModo = null;
        pintasDesdeRuta = false;
        rutasDesdePintas = false;
        setBotonRuta(false);
        mostrarOpcionesRuta(false);
        setBotonesPrincipalesVisible(true, true);
        setBotonAmbosVisible(true);
        setBotonMostrarPintas(false);
        setBotonMostrarRutas(false);
        setBotonAmbosTexto(false);
        setCancelarRutaTopVisible(false, 'Cancelar');
        actualizarVisibilidadPintas();
    } else {
        setPanelVisible(false);
        panelModo = 'rutas';
        pintasDesdeRuta = false;
        rutasDesdePintas = false;
        setPanelInfo('Rutas', 'Desmarca las rutas que no quieras incluir.');
        setPanelListaVisible('rutas');
        setBotonPintas(false);
        setBotonRuta(true);
        mostrarOpcionesRuta(true);
        mostrarOpcionesPintas(false);
        setBotonesPrincipalesVisible(true, false);
        setBotonAmbosVisible(false);
        setBotonMostrarPintas(false);
        setBotonMostrarRutas(false);
        setBotonAmbosTexto(false);
        setCancelarRutaTopVisible(true, 'Salir');
        actualizarVisibilidadPintas();
        construirRutaSeleccionada();
        setBotonAddHabilitado(true);
    }
}

function toggleAmbos() {
    if (modoAgregarRuta || modoAgregarPintas) {
        return;
    }
    const panel = document.getElementById('panel-puntos');
    if (!panel) return;

    if (panelModo === 'ambos') {
        setPanelVisible(false);
        panelModo = null;
        pintasDesdeRuta = false;
        rutasDesdePintas = false;
        setBotonRuta(false);
        setBotonPintas(false);
        mostrarOpcionesRuta(false);
        mostrarOpcionesPintas(false);
        setBotonesPrincipalesVisible(true, true);
        setBotonAmbosVisible(true);
        setBotonMostrarPintas(false);
        setBotonMostrarRutas(false);
        setBotonAmbosTexto(false);
        setCancelarRutaTopVisible(false, 'Cancelar');
        mostrarPintasMapa(false);
        limpiarCapasRutas();
        return;
    }

    setPanelVisible(false);
    panelModo = 'ambos';
    pintasDesdeRuta = false;
    rutasDesdePintas = false;
    setPanelInfo('Rutas y Pintas', 'Rutas y pintas visibles.');
    setPanelListaVisible('ambos');
    setBotonRuta(false);
    setBotonPintas(false);
    mostrarOpcionesRuta(false);
    mostrarOpcionesPintas(false);
    setBotonesPrincipalesVisible(true, true);
    setBotonAmbosVisible(true);
    setBotonMostrarPintas(false);
    setBotonMostrarRutas(false);
    setBotonAmbosTexto(true);
    setCancelarRutaTopVisible(true, 'Salir');
    mostrarPintasMapa(true);
    renderListaPintas();
    construirRutaSeleccionada();
}

function togglePintas() {
    if (modoAgregarRuta) {
        return;
    }
    if (modoAgregarPintas) {
        cancelarAgregarPintas();
        return;
    }
    const panel = document.getElementById('panel-puntos');
    if (!panel) return;

    if (panelModo === 'ambos') {
        panelModo = null;
        setBotonAmbosTexto(false);
        mostrarPintasMapa(false);
        limpiarCapasRutas();
    }

    if (panelModo === 'pintas') {
        setPanelVisible(false);
        panelModo = null;
        pintasDesdeRuta = false;
        rutasDesdePintas = false;
        setBotonPintas(false);
        mostrarOpcionesPintas(false);
        setBotonesPrincipalesVisible(true, true);
        setBotonAmbosVisible(true);
        setBotonMostrarPintas(false);
        setBotonMostrarRutas(false);
        setBotonAmbosTexto(false);
        setCancelarRutaTopVisible(false, 'Cancelar');
        setCancelarPintasTexto('Cancelar');
        mostrarPintasMapa(false);
        limpiarCapasRutas();
        return;
    }

    limpiarRutasVisibles();
    desactivarModoAgregar();
    setBotonAddHabilitado(true);

    setPanelVisible(false);
    panelModo = 'pintas';
    pintasDesdeRuta = false;
    rutasDesdePintas = false;
    setPanelListaVisible('pintas');
    setBotonPintas(true);
    setBotonRuta(false);
    mostrarOpcionesRuta(false);
    mostrarOpcionesPintas(true);
    setBotonesPrincipalesVisible(false, true);
    setBotonAmbosVisible(false);
    setBotonMostrarPintas(false);
    setBotonMostrarRutas(false);
    setBotonAgregarPintasVisible(true);
    setBotonMostrarRutasVisible(true);
    setBotonCancelarPintasVisible(true);
    setBotonAmbosTexto(false);
    setCancelarRutaTopVisible(false, 'Cancelar');
    setCancelarPintasTexto('Salir');
    mostrarPintasMapa(true);
    renderListaPintas();
}

function mostrarPintasDesdeRuta() {
    if (modoAgregarRuta) {
        return;
    }
    if (pintasDesdeRuta) {
        pintasDesdeRuta = false;
        panelModo = 'rutas';
        setPanelListaVisible('rutas');
        mostrarOpcionesPintas(false);
        setBotonMostrarPintas(false);
        setCancelarRutaTopVisible(true, 'Salir');
        rutasDesdePintas = false;
        actualizarVisibilidadPintas();
        return;
    }

    pintasDesdeRuta = true;
    panelModo = 'pintas';
    setPanelListaVisible('pintas');
    mostrarOpcionesPintas(false);
    setBotonMostrarPintas(true);
    setCancelarRutaTopVisible(true, 'Salir');
    actualizarVisibilidadPintas();
    rutasDesdePintas = false;
    renderListaPintas();
}

function activarModoAgregarPintas() {
    if (modoAgregarRuta) {
        return;
    }
    modoAnterior = 'pintas';
    modoAgregarPintas = true;
    bloquearAcciones(true, 'pintas');
    setBotonPintas(true);
    mostrarOpcionesPintas(true);
    setOpcionesPintasSoloCancelar(true);
    setBotonesPrincipalesVisible(false, true);
    setBotonMostrarPintas(false);
    setCancelarRutaTopVisible(false, 'Cancelar');
    setCancelarPintasTexto('Cancelar');
    setBotonAgregarPintasVisible(false);
    setBotonMostrarRutasVisible(false);
    setBotonCancelarPintasVisible(true);
    rutasDesdePintas = false;
    setBotonMostrarRutas(false);
    limpiarCapasRutas();
}

function cancelarAgregarPintas() {
    modoAgregarPintas = false;
    setOpcionesPintasSoloCancelar(false);
    bloquearAcciones(false);
    const volverPintas = modoAnterior === 'pintas';
    if (volverPintas) {
        panelModo = 'pintas';
        setPanelVisible(false);
        setPanelListaVisible('pintas');
        mostrarOpcionesPintas(true);
        setBotonesPrincipalesVisible(false, true);
        setBotonAmbosVisible(false);
        setBotonPintas(true);
        setCancelarPintasTexto('Salir');
        setBotonAgregarPintasVisible(true);
        setBotonMostrarRutasVisible(true);
        setBotonCancelarPintasVisible(true);
        mostrarPintasMapa(true);
        setBotonMostrarRutas(rutasDesdePintas);
        renderListaPintas();
    } else {
        panelModo = null;
        ocultarPanelRutas();
        mostrarOpcionesPintas(false);
        setBotonesPrincipalesVisible(true, true);
        setBotonAmbosVisible(true);
        setBotonPintas(false);
        setCancelarPintasTexto('Cancelar');
        setBotonAgregarPintasVisible(true);
        setBotonMostrarRutasVisible(true);
        setBotonCancelarPintasVisible(true);
        mostrarPintasMapa(false);
        rutasDesdePintas = false;
        limpiarCapasRutas();
    }
    modoAnterior = null;
    pintasDesdeRuta = false;
    setBotonMostrarPintas(false);
    setBotonMostrarRutas(rutasDesdePintas);
    setCancelarRutaTopVisible(false, 'Cancelar');
}

function construirRutaSeleccionada() {
    const puntos = puntosRutaAprobados.filter(p => puntosSeleccionados.has(p.id));
    if (puntos.length < 2) {
        limpiarCapasRutas();
        return;
    }

    limpiarCapasRutas();

    const grupos = {};
    puntos.forEach((p) => {
        const baseDescripcion = obtenerDescripcionBase(p.descripcion);
        const clave = `${baseDescripcion}|${p.fecha || ''}`;
        if (!grupos[clave]) {
            grupos[clave] = [];
        }
        grupos[clave].push(p);
    });

    Object.values(grupos).forEach((grupo) => {
        if (grupo.length < 2) {
            return;
        }
        const descripcionRuta = normalizarDescripcionRuta(grupo[0].descripcion);
        const fechaRuta = grupo[0].fecha || '';
        const popupHtml = `<div style="text-align:center;">
            <b style="color:#e74c3c;">${escapeHtml(descripcionRuta)}</b>
            <br><small style="color:#666; font-weight:bold;">📅 ${formatearFecha(fechaRuta)}</small>
        </div>`;

        grupo.sort((a, b) => {
            const matchA = (a.descripcion || '').match(/\((\d+)\)\s*$/);
            const matchB = (b.descripcion || '').match(/\((\d+)\)\s*$/);
            const idxA = matchA ? Number(matchA[1]) : 0;
            const idxB = matchB ? Number(matchB[1]) : 0;
            return idxA - idxB;
        });

        const puntosLinea = grupo.map((p) => [p.lat, p.lng]);
        const linea = L.polyline(puntosLinea, {
            color: '#e74c3c',
            opacity: 0.85,
            weight: 6
        }).addTo(map);
        linea.bindPopup(popupHtml);
        controlesRutasVisibles.push(linea);
        const primero = grupo[0];
        const ultimo = grupo[grupo.length - 1];
        const marcadorInicio = L.marker([primero.lat, primero.lng], {
            icon: L.divIcon({
                className: 'numero-ruta',
                html: `<div style="background: #e74c3c; color: white; border-radius: 50%; width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 3px solid white; box-shadow: 0 3px 10px rgba(0,0,0,0.4); font-size: 16px;">1</div>`,
                iconSize: [35, 35]
            }),
            draggable: false
        }).addTo(map);
        marcadorInicio.bindPopup(popupHtml);
        marcadoresNumeros.push(marcadorInicio);

        if (ultimo !== primero) {
            const marcadorFin = L.marker([ultimo.lat, ultimo.lng], {
                icon: L.divIcon({
                    className: 'numero-ruta',
                    html: `<div style="background: #e74c3c; color: white; border-radius: 50%; width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 3px solid white; box-shadow: 0 3px 10px rgba(0,0,0,0.4); font-size: 16px;">2</div>`,
                    iconSize: [35, 35]
                }),
                draggable: false
            }).addTo(map);
            marcadorFin.bindPopup(popupHtml);
            marcadoresNumeros.push(marcadorFin);
        }
    });

    rutaVisible = controlesRutasVisibles.length > 0;
    if (panelModo === 'ambos') {
        setBotonRuta(false);
        setBotonPintas(false);
    } else {
        setBotonRuta(rutaVisible);
    }
    if (!rutaVisible) {
        ocultarPanelRutas();
        setBotonAddHabilitado(true);
    }
}

function toggleModoAgregar() {
    if (rutaListaTemporal) {
        return;
    }

    modoAgregarRuta = !modoAgregarRuta;
    const btnAdd = document.getElementById('btn-toggle-add');
    if (modoAgregarRuta) {
        modoAnterior = 'rutas';
        btnAdd.classList.add('activo');
        btnAdd.textContent = 'Añadiendo ruta';
        limpiarRutasVisibles();
        ocultarPanelRutas();
        mostrarPintasMapa(false);
        bloquearAcciones(true, 'ruta');
        modoAgregarPintas = false;
        panelModo = 'rutas';
        pintasDesdeRuta = false;
        mostrarOpcionesRuta(true);
        setOpcionesRutaSoloCancelar(true);
        mostrarOpcionesPintas(false);
        setBotonesPrincipalesVisible(true, false);
        setBotonRuta(true);
        setBotonMostrarPintas(false);
        setCancelarRutaTopVisible(true, 'Cancelar');
        setCancelarPintasTexto('Cancelar');
        resetRutaTemporal();
    } else {
        btnAdd.classList.remove('activo');
        btnAdd.textContent = 'Añadir ruta';
        bloquearAcciones(false);
        setOpcionesRutaSoloCancelar(false);
        setBotonesPrincipalesVisible(true, false);
        setBotonRuta(true);
        setBotonMostrarPintas(false);
        mostrarOpcionesRuta(true);
        setCancelarRutaTopVisible(true, 'Salir');
        setCancelarPintasTexto('Cancelar');
        actualizarVisibilidadPintas();
        resetRutaTemporal();
    }
}

function desactivarModoAgregar() {
    modoAgregarRuta = false;
    setOpcionesRutaSoloCancelar(false);
    const btnAdd = document.getElementById('btn-toggle-add');
    if (btnAdd) {
        btnAdd.classList.remove('activo');
        btnAdd.textContent = 'Añadir ruta';
        btnAdd.disabled = false;
    }
    resetRutaTemporal();
    ocultarPanelRutas();
    bloquearAcciones(false);
    setBotonesPrincipalesVisible(true, true);
    pintasDesdeRuta = false;
    setBotonMostrarPintas(false);
    setCancelarRutaTopVisible(false, 'Cancelar');
    setCancelarPintasTexto('Cancelar');
    actualizarVisibilidadPintas();
}

function manejarClicksRuta(ubicacion) {
    const punto = { lat: ubicacion.lat, lng: ubicacion.lng };
    rutaPuntosTemporales.push(punto);

    if (!rutaInicioTemporal) {
        rutaInicioTemporal = punto;
        if (marcadorInicioTemporal) {
            map.removeLayer(marcadorInicioTemporal);
        }
        marcadorInicioTemporal = L.marker([punto.lat, punto.lng], { draggable: true }).addTo(map);
        marcadorInicioTemporal.on('dragend', function(e) {
            const latlng = e.target.getLatLng();
            rutaPuntosTemporales[0] = { lat: latlng.lat, lng: latlng.lng };
            rutaInicioTemporal = rutaPuntosTemporales[0] || null;
            actualizarLineaTemporal();
        });
    }
    rutaFinTemporal = punto;
    if (marcadorFinTemporal) {
        map.removeLayer(marcadorFinTemporal);
    }
    marcadorFinTemporal = L.marker([punto.lat, punto.lng], { draggable: true }).addTo(map);
    marcadorFinTemporal.on('dragend', function(e) {
        const latlng = e.target.getLatLng();
        const lastIndex = rutaPuntosTemporales.length - 1;
        rutaPuntosTemporales[lastIndex] = { lat: latlng.lat, lng: latlng.lng };
        rutaFinTemporal = rutaPuntosTemporales[lastIndex] || null;
        actualizarLineaTemporal();
    });
    actualizarLineaTemporal();

    if (rutaPuntosTemporales.length >= 2) {
        rutaListaTemporal = true;
        mostrarAccionesRuta(true);
        setBotonesPrincipalesVisible(false, false);
        const btnAdd = document.getElementById('btn-toggle-add');
        if (btnAdd) {
            btnAdd.disabled = true;
        }
    }
}

function agregarRutaLocal(lat, lng, descripcion, fecha) {
    const id = Date.now();
    puntosRutaAprobados.push({
        id,
        lat,
        lng,
        fecha,
        descripcion
    });
    puntosRutaAprobados.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    puntosSeleccionados.add(id);
    renderListaPuntos();
    if (rutaVisible) {
        construirRutaSeleccionada();
    }
}

function cargarRutasDemo() {
    puntosRutaAprobados = DEMO_RUTAS.slice().sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    puntosSeleccionados = new Set(puntosRutaAprobados.map(r => r.id));
    renderListaPuntos();
}

function mostrarAccionesRuta(visible) {
    const extra = document.getElementById('control-ruta-extra');
    if (!extra) return;
    if (visible) {
        extra.classList.add('ruta-extra-visible');
    } else {
        extra.classList.remove('ruta-extra-visible');
    }
}

function resetRutaTemporal() {
    rutaInicioTemporal = null;
    rutaFinTemporal = null;
    rutaListaTemporal = false;
    mostrarAccionesRuta(false);
    rutaPuntosTemporales = [];
    if (lineaRutaTemporal) {
        map.removeLayer(lineaRutaTemporal);
        lineaRutaTemporal = null;
    }
    if (marcadorInicioTemporal) {
        map.removeLayer(marcadorInicioTemporal);
        marcadorInicioTemporal = null;
    }
    if (marcadorFinTemporal) {
        map.removeLayer(marcadorFinTemporal);
        marcadorFinTemporal = null;
    }
    const btnAdd = document.getElementById('btn-toggle-add');
    if (btnAdd && !modoAgregarRuta) {
        btnAdd.disabled = false;
    }
}

function actualizarLineaTemporal() {
    if (rutaPuntosTemporales.length < 2) {
        if (lineaRutaTemporal) {
            map.removeLayer(lineaRutaTemporal);
            lineaRutaTemporal = null;
        }
        return;
    }

    const puntos = rutaPuntosTemporales.map((p) => [p.lat, p.lng]);
    if (lineaRutaTemporal) {
        lineaRutaTemporal.setLatLngs(puntos);
    } else {
        lineaRutaTemporal = L.polyline(puntos, {
            color: '#1abc9c',
            opacity: 0.85,
            weight: 6
        }).addTo(map);
    }
}

function obtenerWaypointsTemporal() {
    return rutaPuntosTemporales.map((p) => ({ lat: p.lat, lng: p.lng }));
}

function finalizarRutaTemporal() {
    resetRutaTemporal();
    modoAgregarRuta = false;
    const btnAdd = document.getElementById('btn-toggle-add');
    if (btnAdd) {
        btnAdd.classList.remove('activo');
        btnAdd.textContent = 'Añadir ruta';
    }
    bloquearAcciones(false);
    setBotonesPrincipalesVisible(true, true);
    pintasDesdeRuta = false;
    setBotonMostrarPintas(false);
    setCancelarRutaTopVisible(false, 'Cancelar');
    setCancelarPintasTexto('Cancelar');
    actualizarVisibilidadPintas();
}

function aceptarRuta() {
    if (!rutaInicioTemporal || !rutaFinTemporal) {
        return;
    }
    setModoFormulario('ruta');
    const modal = document.getElementById('modal-formulario');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('formulario-zona').reset();
        setControlesBloqueados(true);
        const hoy = new Date().toISOString().split('T')[0];
        document.getElementById('fecha').value = hoy;
        document.getElementById('nombre-archivo').textContent = 'Ningún archivo seleccionado';
    }
}

function cancelarRuta() {
    if (modoAgregarRuta) {
        modoAgregarRuta = false;
        setOpcionesRutaSoloCancelar(false);
        const btnAdd = document.getElementById('btn-toggle-add');
        if (btnAdd) {
            btnAdd.classList.remove('activo');
            btnAdd.textContent = 'Añadir ruta';
            btnAdd.disabled = false;
        }
        resetRutaTemporal();
        bloquearAcciones(false);
        panelModo = 'rutas';
        pintasDesdeRuta = false;
        setPanelVisible(false);
        setPanelListaVisible('rutas');
        mostrarOpcionesRuta(true);
        mostrarOpcionesPintas(false);
        setBotonesPrincipalesVisible(true, false);
        setBotonRuta(true);
        setBotonPintas(false);
        setBotonMostrarPintas(false);
        setCancelarRutaTopVisible(true, 'Salir');
        actualizarVisibilidadPintas();
        construirRutaSeleccionada();
        return;
    }

    resetRutaTemporal();
    modoAgregarRuta = false;
    const btnAdd = document.getElementById('btn-toggle-add');
    if (btnAdd) {
        btnAdd.classList.remove('activo');
        btnAdd.textContent = 'Añadir ruta';
    }
    bloquearAcciones(false);
    panelModo = null;
    ocultarPanelRutas();
    mostrarOpcionesRuta(false);
    mostrarOpcionesPintas(false);
    setBotonesPrincipalesVisible(true, true);
    setBotonAmbosVisible(true);
    pintasDesdeRuta = false;
    setBotonMostrarPintas(false);
    setCancelarRutaTopVisible(false, 'Cancelar');
    setCancelarPintasTexto('Cancelar');
    actualizarVisibilidadPintas();
}

function setModoFormulario(modo) {
    modoFormulario = modo;
    const titulo = document.getElementById('modal-titulo');
    const labelDescripcion = document.getElementById('label-descripcion');
    const descripcionInput = document.getElementById('descripcion');
    const grupoTipo = document.getElementById('grupo-tipo');
    const tipoAnuncio = document.getElementById('tipoAnuncio');
    const labelPersona = document.getElementById('label-persona');
    const personaInput = document.getElementById('persona');
    const labelFoto = document.getElementById('label-foto');

    if (modo === 'ruta') {
        if (titulo) titulo.textContent = 'Registrar Ruta';
        if (labelDescripcion) labelDescripcion.textContent = 'Direccion de la Ruta:';
        if (descripcionInput) descripcionInput.placeholder = 'Ej: Av. Principal 123';
        if (grupoTipo) grupoTipo.style.display = 'none';
        if (tipoAnuncio) tipoAnuncio.required = false;
        if (labelPersona) labelPersona.textContent = 'Quien lo sube:';
        if (personaInput) personaInput.placeholder = 'Nombre completo';
        if (labelFoto) labelFoto.textContent = 'Foto (opcional):';
    } else {
        if (titulo) titulo.textContent = 'Registrar Nueva Zona';
        if (labelDescripcion) labelDescripcion.textContent = 'Descripcion de la Zona:';
        if (descripcionInput) descripcionInput.placeholder = 'Ej: Parque central, esquina';
        if (grupoTipo) grupoTipo.style.display = 'flex';
        if (tipoAnuncio) tipoAnuncio.required = true;
        if (labelPersona) labelPersona.textContent = 'Promotor:';
        if (personaInput) personaInput.placeholder = 'Tu nombre completo';
        if (labelFoto) labelFoto.textContent = 'Seleccionar Imagen (opcional):';
    }
}

function inicializarControles() {
    mostrarOpcionesRuta(false);
    mostrarOpcionesPintas(false);
    mostrarAccionesRuta(false);
    setBotonRuta(false);
    setBotonPintas(false);
    setBotonMostrarPintas(false);
    setCancelarRutaTopVisible(false, 'Cancelar');
    setCancelarPintasTexto('Cancelar');
    setBotonAgregarPintasVisible(true);
}

inicializarControles();

if (SUPABASE_ENABLED) {
    cargarPuntosAprobados();
    cargarRutasAprobadas();
} else {
    cargarRutasDemo();
}

function mostrarRutasDesdePintas() {
    if (modoAgregarRuta) {
        return;
    }
    if (rutasDesdePintas) {
        rutasDesdePintas = false;
        setBotonMostrarRutas(false);
        limpiarCapasRutas();
        return;
    }

    rutasDesdePintas = true;
    setBotonMostrarRutas(true);
    construirRutaSeleccionada();
}

