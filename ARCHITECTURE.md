# Architecture Overview

## System Components

**Frontend**: Vite + React + TypeScript + CesiumJS (Static Website)  
**Backend**: FastAPI service (Container Apps)  
**Data Sources**: Cesium ion, Aviation Weather APIs  
**Deployment**: GitHub Actions CI/CD  

## Architecture Diagram

```
Browser
    ↓ HTTPS
Frontend (Static Website)
- Vite + React + TypeScript + CesiumJS
- Camera controls, timeline, NOTAM chat UI
    ↓ REST API calls
Backend (Container Apps)  
- FastAPI service with Docker
- Intent validation, weather, NOTAM endpoints
    ↓ Configuration
Configuration Management
- Runtime settings
- Provider configurations

External Services:
- Cesium ion (terrain, OSM Buildings tiles)
- Aviation Weather APIs (METAR data)
- Container Registry (Docker images)
```

## Key Technical Features

### CesiumJS Implementation
- **CesiumViewer**: Core globe with terrain and OSM Buildings
- **Time-Dynamic Entities**: Flight tracks with SampledPositionProperty
- **Camera Control**: 5 advanced modes with smooth transitions
- **3D Tiles Styling**: Height-band building visualization
- **Timeline Integration**: Smooth animation with viewer.clock

### Data Flows
1. **Camera Commands**: UI → Backend validation → Frontend dispatcher → Cesium effects
2. **Weather Data**: Frontend → Backend API → Aviation weather services → Structured response
3. **NOTAM Q&A**: Chat UI → Backend search → Vector/text matching → Citation-based answers
4. **Tiles/Terrain**: Frontend → Cesium ion → High-quality global assets

### Performance Optimizations
- Scoped OSM Buildings rendering (~2km radius)
- Proper Cesium event cleanup and memory management
- Cached API responses with TTL
- Slowed animations for demo clarity

## Security & Configuration
- No secrets in code repository
- Secure token injection at build time
- Configuration management via environment
- CORS restrictions for production deployment

## Production Deployment
- Automated CI/CD pipeline
- Container-based backend deployment
- Static website hosting
- Comprehensive monitoring and logging
