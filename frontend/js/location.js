/* ==========================================================================
   Silent SOS - Location, Mapping & Route Manager
   ========================================================================== */

export class LocationManager {
  constructor(app) {
    this.app = app;
    this.lat = 6.5244; // Default: Lagos, Nigeria
    this.lng = 3.3792;
    this.accuracy = 10;
    this.path = []; // Coordinate history
    
    // Custom Selected Location Targets (for Safe Zones setting)
    this.selectedLat = 6.5244;
    this.selectedLng = 3.3792;
    this.selectedMarker = null;
    
    this.isTracking = false;
    this.watchId = null;
    
    // Maps
    this.userMap = null;
    this.contactMap = null;
    this.userMarker = null;
    this.contactMarker = null;
    this.userPathLine = null;
    this.contactPathLine = null;
    this.deviationThreshold = 0.0005; // Angular deviation threshold (~50 meters)
    
    this.safetyZones = [];
    this.safetyZonesGroup = null;

    // Safe Walk state
    this.safeWalkActive = false;
    this.destination = { name: 'Workplace', lat: 6.5290, lng: 3.3840 };
    this.plannedRoute = [
      { lat: 6.5244, lng: 3.3792 }, // Home (Lagos Island)
      { lat: 6.5252, lng: 3.3806 },
      { lat: 6.5262, lng: 3.3818 },
      { lat: 6.5274, lng: 3.3829 },
      { lat: 6.5290, lng: 3.3840 }  // Workplace (Victoria Island)
    ];
    this.routeIndex = 0;
    
    // Simulated path variants
    this.simulatedPaths = {
      stationary: [
        { lat: 6.5244, lng: 3.3792 }
      ],
      'safe-walk': [
        { lat: 6.5244, lng: 3.3792 },
        { lat: 6.5252, lng: 3.3806 },
        { lat: 6.5262, lng: 3.3818 },
        { lat: 6.5274, lng: 3.3829 },
        { lat: 6.5290, lng: 3.3840 }
      ],
      deviation: [
        { lat: 6.5244, lng: 3.3792 },
        { lat: 6.5252, lng: 3.3806 },
        { lat: 6.5262, lng: 3.3818 },
        { lat: 6.5240, lng: 3.3760 }, // Deviated point!
        { lat: 6.5225, lng: 3.3740 }
      ],
      'emergency-move': [
        { lat: 6.5244, lng: 3.3792 },
        { lat: 6.5238, lng: 3.3775 },
        { lat: 6.5228, lng: 3.3758 },
        { lat: 6.5218, lng: 3.3770 },
        { lat: 6.5205, lng: 3.3780 }
      ]
    };
    
    this.activeSimPathName = 'stationary';
    this.activeSimIndex = 0;
    this.customRoutePlanning = false;
    this.customRoutePolyline = null;
    this.customRouteMarkers = [];
  }

  getHeaders() {
    const token = localStorage.getItem('silentsos_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  // Fetch Safe Zones
  async loadSafeZones() {
    try {
      const response = await fetch('/api/zones', { headers: this.getHeaders() });
      if (response.ok) {
        this.safetyZones = await response.json();
      }
    } catch (err) {
      console.error('Error loading safe zones:', err);
    }
    return this.safetyZones;
  }

  // Create Safe Zone
  async addSafeZone(name, lat, lng, radius = 100) {
    try {
      const response = await fetch('/api/zones', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ name, lat, lng, radius })
      });
      if (response.ok) {
        const newZone = await response.json();
        this.safetyZones.push(newZone);
        this.drawSafetyZoneCircles();
        return newZone;
      }
    } catch (err) {
      console.error('Error adding safe zone:', err);
    }
  }

  // Delete Safe Zone
  async deleteSafeZone(zoneId) {
    try {
      const response = await fetch(`/api/zones/${zoneId}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      if (response.ok) {
        this.safetyZones = this.safetyZones.filter(z => z.id !== zoneId);
        this.drawSafetyZoneCircles();
      }
    } catch (err) {
      console.error('Error deleting safe zone:', err);
    }
  }

  // Initialize Map elements
  initUserMap(elementId) {
    const container = document.getElementById(elementId);
    if (!container) return;

    // Check if map is already initialized
    if (this.userMap) {
      this.userMap.remove();
      this.selectedMarker = null; // Reset selection marker on map rebuild
    }
    
    // Reset selected coordinates to current user location when map is rebuilt
    this.selectedLat = this.lat;
    this.selectedLng = this.lng;
    
    try {
      this.userMap = L.map(elementId, { zoomControl: false }).setView([this.lat, this.lng], 15);
      
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
      }).addTo(this.userMap);
      
      this.userMarker = L.marker([this.lat, this.lng]).addTo(this.userMap)
        .bindPopup("<b>You</b>").openPopup();
        
      this.userPathLine = L.polyline(this.path.map(p => [p.lat, p.lng]), { color: '#08d9d6', weight: 4 }).addTo(this.userMap);
      
      // Draw safety zones on User Map
      this.drawSafetyZoneCircles();
      this.showNearbyAssistance('police'); // Default pins

      if (this.customRoutePlanning && this.plannedRoute.length > 0) {
        this.customRoutePolyline = L.polyline(this.plannedRoute.map(p => [p.lat, p.lng]), { color: '#ff9900', weight: 4, dashArray: '5, 10' }).addTo(this.userMap);
        this.customRouteMarkers = this.plannedRoute.map(p => {
          return L.circleMarker([p.lat, p.lng], { radius: 6, color: '#ff9900', fillColor: '#fff', fillOpacity: 1 }).addTo(this.userMap);
        });
      }

      this.userMap.on('click', (e) => {
        if (this.customRoutePlanning) {
          const { lat, lng } = e.latlng;
          this.plannedRoute.push({ lat, lng });
          
          if (this.customRoutePolyline) {
            this.customRoutePolyline.setLatLngs(this.plannedRoute.map(p => [p.lat, p.lng]));
          } else {
            this.customRoutePolyline = L.polyline(this.plannedRoute.map(p => [p.lat, p.lng]), { color: '#ff9900', weight: 4, dashArray: '5, 10' }).addTo(this.userMap);
          }
          
          const marker = L.circleMarker([lat, lng], { radius: 6, color: '#ff9900', fillColor: '#fff', fillOpacity: 1 }).addTo(this.userMap);
          this.customRouteMarkers.push(marker);
          
          const countSpan = document.getElementById('route-waypoint-count');
          if (countSpan) countSpan.textContent = this.plannedRoute.length;
          
          this.app.logEvent(`Added custom route waypoint: ${lat.toFixed(5)}, ${lng.toFixed(5)}`, 'info');
          this.app.showToast('Waypoint Added', 'Waypoint saved to custom Safe Walk route.', 'success');
        } else {
          const { lat, lng } = e.latlng;
          this.setSelectedLocation(lat, lng, `Tapped Map Location`);
        }
      });
    } catch (e) {
      console.error("Leaflet map initialization failed: ", e);
    }
  }

  initContactMap(elementId) {
    const container = document.getElementById(elementId);
    if (!container) return;

    if (this.contactMap) {
      this.contactMap.remove();
    }

    try {
      this.contactMap = L.map(elementId).setView([this.lat, this.lng], 15);
      
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
      }).addTo(this.contactMap);
      
      this.contactMarker = L.marker([this.lat, this.lng]).addTo(this.contactMap)
        .bindPopup(`<b>${this.app.authManager.currentUser?.name || 'Jane Doe'} (Active SOS)</b>`).openPopup();
        
      this.contactPathLine = L.polyline(this.path.map(p => [p.lat, p.lng]), { color: '#ff2e63', weight: 5 }).addTo(this.contactMap);
    } catch (e) {
      console.error("Leaflet Contact Map failed: ", e);
    }
  }

  // Start tracking coordinate changes
  startTracking() {
    this.isTracking = true;
    this.path = [{ lat: this.lat, lng: this.lng, timestamp: new Date().toLocaleTimeString() }];
    
    if (navigator.geolocation) {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          // If we are simulating, override real GPS values
          if (this.activeSimPathName === 'stationary') {
            this.updateLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
          }
        },
        (err) => {
          console.warn("GPS tracking error. Falling back to simulator mode.", err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }

  stopTracking() {
    this.isTracking = false;
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  // Update coordinate values
  updateLocation(latitude, longitude, accuracy = 10) {
    this.lat = latitude;
    this.lng = longitude;
    this.accuracy = accuracy;
    
    const timeStr = new Date().toLocaleTimeString();
    this.path.push({ lat: latitude, lng: longitude, timestamp: timeStr });
    
    // Update active incident coordinate updates
    if (this.app.sosActiveIncident) {
      this.app.sosActiveIncident.lastLocation = { lat: latitude, lng: longitude };
      this.app.sosActiveIncident.locationPath.push({ lat: latitude, lng: longitude, timestamp: timeStr });
      
      // Async POST update to server
      const token = localStorage.getItem('silentsos_token');
      fetch('/api/sos/location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ lat: latitude, lng: longitude })
      }).catch(err => console.error('Failed to sync location with server:', err));
    }

    // Refresh UI coordinate displays
    const latSpan = document.getElementById('sim-lat');
    const lngSpan = document.getElementById('sim-lng');
    if (latSpan) latSpan.textContent = latitude.toFixed(6);
    if (lngSpan) lngSpan.textContent = longitude.toFixed(6);

    // Redraw maps
    if (this.userMap && this.userMarker) {
      const latlng = L.latLng(latitude, longitude);
      this.userMarker.setLatLng(latlng);
      this.userPathLine.setLatLngs(this.path.map(p => [p.lat, p.lng]));
      this.userMap.panTo(latlng);
    }
    
    if (this.contactMap && this.contactMarker) {
      const latlng = L.latLng(latitude, longitude);
      this.contactMarker.setLatLng(latlng);
      this.contactPathLine.setLatLngs(this.path.map(p => [p.lat, p.lng]));
      this.contactMap.panTo(latlng);
      
      const currLat = document.getElementById('contact-curr-lat');
      const currLng = document.getElementById('contact-curr-lng');
      const lastUp = document.getElementById('contact-last-update');
      if (currLat) currLat.textContent = latitude.toFixed(5);
      if (currLng) currLng.textContent = longitude.toFixed(5);
      if (lastUp) lastUp.textContent = `Last update: ${timeStr}`;
    }

    // Trigger monitors
    this.checkSafeWalkDeviation();
    this.checkSafetyZoneBoundary();
  }

  // Simulator Route logic
  setSimulationPath(pathName) {
    this.activeSimPathName = pathName;
    this.activeSimIndex = 0;
    const pathCoords = this.simulatedPaths[pathName];
    if (pathCoords && pathCoords.length > 0) {
      this.updateLocation(pathCoords[0].lat, pathCoords[0].lng);
    }
  }

  incrementSimulatedStep() {
    const coords = this.simulatedPaths[this.activeSimPathName];
    if (!coords) return;
    
    this.activeSimIndex = (this.activeSimIndex + 1) % coords.length;
    const nextPt = coords[this.activeSimIndex];
    this.updateLocation(nextPt.lat, nextPt.lng);
    this.app.logEvent(`Simulator updated GPS step to coordinate: ${nextPt.lat.toFixed(5)}, ${nextPt.lng.toFixed(5)}`, 'info');
  }

  // --- SAFE WALK MODE ---
  startSafeWalk(destinationName) {
    this.safeWalkActive = true;
    this.routeIndex = 0;
    this.app.logEvent(`Safe Walk started. Destination: ${destinationName}. Sharing tracking route.`, 'success');
  }

  stopSafeWalk() {
    this.safeWalkActive = false;
    this.app.logEvent('Safe Walk completed. Arrived safely.', 'success');
  }

  checkSafeWalkDeviation() {
    if (!this.safeWalkActive) return;
    
    // Find closest point on planned route
    let minDistance = Infinity;
    this.plannedRoute.forEach(pt => {
      const dist = Math.sqrt(Math.pow(this.lat - pt.lat, 2) + Math.pow(this.lng - pt.lng, 2));
      if (dist < minDistance) {
        minDistance = dist;
      }
    });

    // If deviation exceeds threshold, alert user and prepare SOS
    if (minDistance > this.deviationThreshold) {
      this.app.logEvent('WARNING: Significant route deviation detected!', 'error');
      this.app.showToast('Route Deviation Detected!', 'You have drifted from your planned Safe Walk route. Please check in.', 'error');
      this.app.timersManager.startDeviationCountdown();
    }
  }

  // --- SAFETY ZONES ---
  checkSafetyZoneBoundary() {
    this.safetyZones.forEach(zone => {
      const dist = Math.sqrt(Math.pow(this.lat - zone.lat, 2) + Math.pow(this.lng - zone.lng, 2));
      const radDegrees = zone.radius / 111000; // rough convert meters to degrees
      
      const insideNow = dist <= radDegrees;
      const wasInside = zone.wasInside !== undefined ? zone.wasInside : true; // initial assume inside
      
      if (insideNow && !wasInside) {
        this.app.logEvent(`Entered Safety Zone: ${zone.name}`, 'info');
        this.app.showToast('Safety Zone Entered', `You entered your safe zone: ${zone.name}`, 'success');
      } else if (!insideNow && wasInside) {
        this.app.logEvent(`Exited Safety Zone: ${zone.name}`, 'warning');
        this.app.showToast('Safety Zone Exited', `You left your safe zone: ${zone.name}`, 'info');
        
        if (this.app.sosManager.config.geofenceAutoSosEnabled) {
          this.app.logEvent(`Geofence Auto-SOS: Triggered check-in countdown due to exit of ${zone.name}.`, 'warning');
          this.app.showToast('Geofence Exit Countdown', 'Exited safe zone. Disarm timer with PIN or SOS triggers.', 'error');
          this.app.timersManager.startSafetyTimer(15);
        }
      }
      
      zone.wasInside = insideNow;
    });
  }

  drawSafetyZoneCircles() {
    if (!this.userMap) return;
    
    if (this.safetyZonesGroup) {
      this.userMap.removeLayer(this.safetyZonesGroup);
    }
    
    const circles = [];
    this.safetyZones.forEach(zone => {
      const circle = L.circle([zone.lat, zone.lng], {
        color: '#2ecc71',
        fillColor: '#2ecc71',
        fillOpacity: 0.15,
        radius: zone.radius
      }).bindPopup(`Safe Zone: ${zone.name}`);
      circles.push(circle);
    });
    
    this.safetyZonesGroup = L.layerGroup(circles).addTo(this.userMap);
  }

  // --- NEARBY ASSISTANCE SERVICES ---
  showNearbyAssistance(category) {
    if (!this.userMap) return;
    
    if (this.assistanceGroup) {
      this.userMap.removeLayer(this.assistanceGroup);
    }
    
    const assistanceMarkers = [];
    
    // Generate mock assistance assets near current user lat/lng (Nigeria-based)
    const mockServices = {
      police: [
        { name: 'Lagos Area Command Police HQ', lat: this.lat + 0.004, lng: this.lng - 0.003 },
        { name: 'Panti Police Division', lat: this.lat - 0.005, lng: this.lng + 0.005 }
      ],
      hospital: [
        { name: 'Lagos Island General Hospital', lat: this.lat + 0.002, lng: this.lng + 0.004 },
        { name: 'LASUTH Emergency Care Centre', lat: this.lat - 0.003, lng: this.lng - 0.006 }
      ],
      fire: [
        { name: 'Lagos State Fire Service - Marina', lat: this.lat - 0.002, lng: this.lng + 0.002 }
      ],
      security: [
        { name: 'G4S Nigeria Security Office', lat: this.lat + 0.006, lng: this.lng + 0.002 }
      ]
    };
    
    const categoryPins = mockServices[category] || [];
    
    const colors = { police: '#0052cc', hospital: '#cc0000', fire: '#ff9900', security: '#555' };
    const pinColor = colors[category] || '#000';
    
    categoryPins.forEach(item => {
      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color: ${pinColor}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.5);"></div>`,
        iconSize: [12, 12]
      });
      
      const marker = L.marker([item.lat, item.lng], { icon: icon })
        .bindPopup(`<b>${item.name}</b><br>Type: ${category.toUpperCase()}`);
      assistanceMarkers.push(marker);
    });
    
    this.assistanceGroup = L.layerGroup(assistanceMarkers).addTo(this.userMap);
  }

  setSelectedLocation(lat, lng, labelText) {
    this.selectedLat = lat;
    this.selectedLng = lng;
    
    // Update label in UI if it exists
    const label = document.getElementById('selected-location-label');
    if (label) {
      label.textContent = `Target: ${labelText} (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    }
    
    // Add or update selection target marker on the map
    if (this.userMap) {
      if (this.selectedMarker) {
        this.selectedMarker.setLatLng([lat, lng]);
        this.selectedMarker.setPopupContent(`<b>Selected: ${labelText}</b>`);
      } else {
        const pinIcon = L.divIcon({
          className: 'target-div-icon',
          html: `<div style="background-color: var(--color-green); width: 14px; height: 14px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 0 10px rgba(0, 242, 169, 0.6); animation: pulse-dot 1s infinite alternate;"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });
        this.selectedMarker = L.marker([lat, lng], { icon: pinIcon }).addTo(this.userMap)
          .bindPopup(`<b>Selected: ${labelText}</b>`).openPopup();
      }
      this.userMap.panTo([lat, lng]);
    }
  }

  async searchAddress(query) {
    if (!query) return;
    
    this.app.logEvent(`Geocoding search initiated: "${query}"`, 'info');
    try {
      // Nominatim search query — restricted to Nigeria (countrycodes=ng)
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=ng`, {
        headers: {
          'Accept-Language': 'en'
        }
      });
      
      if (!response.ok) throw new Error('Search request failed');
      const data = await response.json();
      
      if (data && data.length > 0) {
        const result = data[0];
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        const displayName = result.display_name.split(',')[0] || result.type || 'Searched Location';
        
        this.setSelectedLocation(lat, lng, displayName);
        this.app.logEvent(`Geocoding matches: ${displayName} (${lat.toFixed(5)}, ${lng.toFixed(5)})`, 'success');
        this.app.showToast('Location Found', `Centered map on: ${displayName}`, 'success');
      } else {
        this.app.showToast('No Results', 'No locations matched your search query.', 'error');
        this.app.logEvent(`Geocoding: no search results for "${query}"`, 'warning');
      }
    } catch (err) {
      console.error('Geocoding search failed:', err);
      this.app.showToast('Search Error', 'Unable to reach geocoding lookup service.', 'error');
    }
  }
}
