// 1. Configuración de Supabase
const SUPABASE_URL = 'https://jwtruolnvepievxheuyh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8QmGDNmTJSCnnQT22-SSBA_9UFzR0YN';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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

map.on('click', function(e) {
    // Aquí capturamos la latitud y longitud del clic
    ubicacionActual = { lat: e.latlng.lat, lng: e.latlng.lng };
    
    const modal = document.getElementById('modal-formulario');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('formulario-zona').reset();
        
        // Establecer fecha de hoy por defecto
        const hoy = new Date().toISOString().split('T')[0];
        document.getElementById('fecha').value = hoy;
        
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
    const { data, error } = await _supabase.from('puntos').select('*');
    if (error) return;
    if (data) {
        const puntosOrdenados = [];
        
        data.forEach(p => {
            if (p.estado === 'aprobado') {
                const fechaFormateada = p.fecha_registro ? formatearFecha(p.fecha_registro) : 'Sin fecha';
                const fotoHtml = p.foto_url ? `<img src="${p.foto_url}" width="150px" style="border-radius:8px; margin:10px 0;">` : '';
                
                L.marker([p.latitud, p.longitud]).addTo(map)
                .bindPopup(`<div style="text-align:center;">
                    <b style="color:#27ae60; font-size:1.1em;">${p.descripcion}</b>
                    <br><small style="color:#666; font-weight:bold;">📅 ${fechaFormateada}</small>
                    <br><small style="color:#999;">Por: ${p.nombre_persona}</small>
                    ${fotoHtml}
                </div>`);
                
                // Agregar a la lista para la ruta
                puntosOrdenados.push({
                    id: p.id,
                    lat: p.latitud,
                    lng: p.longitud,
                    fecha: p.fecha_registro,
                    descripcion: p.descripcion
                });
            } else if (p.estado === 'pendiente') {
                const fechaFormateada = p.fecha_registro ? formatearFecha(p.fecha_registro) : 'Sin fecha';
                const fotoHtml = p.foto_url ? `<img src="${p.foto_url}" width="150px" style="border-radius:8px; margin:10px 0;">` : '';
                
                L.marker([p.latitud, p.longitud], {
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
            }
        });
        
        // Ordenar puntos por fecha para la ruta
        puntosOrdenados.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        puntosRutaAprobados = puntosOrdenados;
        puntosSeleccionados = new Set(puntosOrdenados.map(p => p.id));
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

function renderListaPuntos() {
    const contenedor = document.getElementById('lista-puntos');
    if (!contenedor) return;

    contenedor.innerHTML = '';
    puntosRutaAprobados.forEach(p => {
        const item = document.createElement('label');
        item.className = 'punto-item';
        item.innerHTML = `
            <input type="checkbox" data-id="${p.id}" ${puntosSeleccionados.has(p.id) ? 'checked' : ''}>
            <span>
                <span class="punto-nombre">${escapeHtml(p.descripcion)}</span>
                <span class="punto-fecha">${formatearFecha(p.fecha)}</span>
            </span>
        `;
        contenedor.appendChild(item);
    });
}

document.addEventListener('change', function(e) {
    if (e.target && e.target.matches('#lista-puntos input[type="checkbox"]')) {
        const id = Number(e.target.getAttribute('data-id'));
        if (e.target.checked) {
            puntosSeleccionados.add(id);
        } else {
            puntosSeleccionados.delete(id);
        }
        if (rutaVisible) {
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
            if (!ubicacionActual || !ubicacionActual.lat || !ubicacionActual.lng) {
                alert('❌ Error: No se detectó la ubicación.\n\nPor favor:\n1. Cierra esta ventana\n2. Haz clic exacto en el mapa donde desees registrar la zona\n3. Vuelve a llenar el formulario');
                return;
            }

            const btnEnviar = document.querySelector('.btn-confirmar');
            const archivo = document.getElementById('foto').files[0];
            
            if (!archivo) { 
                alert('⚠️ Selecciona una foto');
                return;
            }

            // Guardar datos antes de cerrar el modal
            const descripcion = document.getElementById('descripcion').value;
            const persona = document.getElementById('persona').value;
            const fecha = document.getElementById('fecha').value;

            // Cerrar modal del formulario INMEDIATAMENTE
            cerrarModal();
            
            // Mostrar modal de carga INMEDIATAMENTE
            mostrarCarga();

            try {
                const imagenComprimida = await comprimirImagen(archivo);
                const urlFinal = await subirFoto(imagenComprimida);

                if (urlFinal) {
                    const { error: insertError } = await _supabase.from('puntos').insert([{
                        latitud: ubicacionActual.lat,
                        longitud: ubicacionActual.lng,
                        nombre_persona: persona,
                        nombre_patrocinador: persona,
                        descripcion: descripcion,
                        tipo_anuncio: document.getElementById('tipoAnuncio').value,
                        fecha_registro: fecha,
                        estado: 'pendiente',
                        foto_url: urlFinal
                    }]);

                    if (!insertError) {
                        // Cambiar a check después de 1 segundo
                        setTimeout(() => {
                            mostrarCheck();
                        }, 1000);
                        
                        // Cerrar modal y agregar marcador después de 2.5 segundos
                        setTimeout(() => {
                            cerrarModalExito();
                            
                            // Agregar marcador semitransparente al mapa
                            agregarMarcadorPendiente(
                                ubicacionActual.lat,
                                ubicacionActual.lng,
                                descripcion,
                                persona,
                                urlFinal
                            );
                        }, 2500);
                    } else {
                        cerrarModalExito();
                        alert('❌ Error: ' + insertError.message);
                    }
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
    
    // Guardar referencia del marcador
    ultimoRegistro = {
        latitud,
        longitud,
        descripcion,
        nombre_persona,
        foto_url,
        marcador
    };
}

// Función para dibujar/ocultar la ruta
function toggleRuta() {
    if (!puntosRutaAprobados || puntosRutaAprobados.length < 2) {
        alert('⚠️ Se necesitan al menos 2 puntos aprobados para mostrar una ruta');
        return;
    }
    
    if (rutaVisible) {
        // Ocultar ruta
        if (controlRuta) {
            map.removeControl(controlRuta);
            controlRuta = null;
        }
        // Eliminar marcadores de números
        marcadoresNumeros.forEach(marcador => map.removeLayer(marcador));
        marcadoresNumeros = [];
        
        rutaVisible = false;
        document.getElementById('texto-ruta').textContent = 'Mostrar Ruta';
        document.getElementById('icono-ruta').textContent = '🗺️';
        document.getElementById('btn-toggle-ruta').style.background = '#27ae60';
        document.getElementById('panel-puntos').classList.remove('panel-visible');
    } else {
        document.getElementById('panel-puntos').classList.add('panel-visible');
        construirRutaSeleccionada();
    }
}

function construirRutaSeleccionada() {
    const puntos = puntosRutaAprobados.filter(p => puntosSeleccionados.has(p.id));
    if (puntos.length < 2) {
        if (controlRuta) {
            map.removeControl(controlRuta);
            controlRuta = null;
        }
        rutaVisible = false;
        document.getElementById('texto-ruta').textContent = 'Mostrar Ruta';
        document.getElementById('icono-ruta').textContent = '🗺️';
        document.getElementById('btn-toggle-ruta').style.background = '#27ae60';
        document.getElementById('panel-puntos').classList.remove('panel-visible');
        return;
    }

    if (controlRuta) {
        map.removeControl(controlRuta);
        controlRuta = null;
    }

    const waypoints = puntos.map(p => L.latLng(p.lat, p.lng));

    controlRuta = L.Routing.control({
        waypoints: waypoints,
        routeWhileDragging: false,
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        showAlternatives: false,
        lineOptions: {
            styles: [{
                color: '#e74c3c',
                opacity: 0.8,
                weight: 6
            }]
        },
        createMarker: function(i, waypoint, n) {
            return L.marker(waypoint.latLng, {
                icon: L.divIcon({
                    className: 'numero-ruta',
                    html: `<div style="background: #e74c3c; color: white; border-radius: 50%; width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 3px solid white; box-shadow: 0 3px 10px rgba(0,0,0,0.4); font-size: 16px;">${i + 1}</div>`,
                    iconSize: [35, 35]
                }),
                draggable: false
            });
        },
        router: L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1',
            profile: 'driving'
        })
    }).addTo(map);

    const contenedorInstrucciones = document.querySelector('.leaflet-routing-container');
    if (contenedorInstrucciones) {
        contenedorInstrucciones.style.display = 'none';
    }

    rutaVisible = true;
    document.getElementById('texto-ruta').textContent = 'Ocultar Ruta';
    document.getElementById('icono-ruta').textContent = '✖️';
    document.getElementById('btn-toggle-ruta').style.background = '#e74c3c';
    document.getElementById('panel-puntos').classList.add('panel-visible');
}

cargarPuntosAprobados();
