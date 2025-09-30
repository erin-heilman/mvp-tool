// MVP Tool Application Logic

// Data storage
let sheetsData = {
    clinicians: [],
    measures: [],
    mvps: [],
    benchmarks: [],
    assignments: [],
    selections: [],
    performance: [],
    work: [],
    config: []
};

let selectedClinicians = new Set();
let selectedMVP = null;
let currentMode = 'planning';
let mvpAssignments = {};
let mvpSelections = {};

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);

async function init() {
    try {
        updateLoadingText('Loading data from Google Sheets...');
        
        // Fetch all data from API endpoints
        const responses = await Promise.all([
            fetch('/api/sheets/clinicians'),
            fetch('/api/sheets/measures'),
            fetch('/api/sheets/mvps'),
            fetch('/api/sheets/benchmarks'),
            fetch('/api/sheets/assignments'),
            fetch('/api/sheets/selections'),
            fetch('/api/sheets/performance'),
            fetch('/api/sheets/work'),
            fetch('/api/sheets/config')
        ]);
        
        // Parse responses
        sheetsData.clinicians = await responses[0].json();
        sheetsData.measures = await responses[1].json();
        sheetsData.mvps = await responses[2].json();
        sheetsData.benchmarks = await responses[3].json();
        sheetsData.assignments = await responses[4].json();
        sheetsData.selections = await responses[5].json();
        sheetsData.performance = await responses[6].json();
        sheetsData.work = await responses[7].json();
        sheetsData.config = await responses[8].json();
        
        console.log('All data loaded:', {
            clinicians: sheetsData.clinicians.length,
            measures: sheetsData.measures.length,
            mvps: sheetsData.mvps.length,
            benchmarks: sheetsData.benchmarks.length
        });
        
        // Process existing data
        processExistingData();
        
        // Populate UI
        updateLoadingText('Building interface...');
        loadUnassignedClinicians();
        updateMVPGrid();
        populateFilters();
        populateBulkMVPSelect();
        updateStats();
        
        // Hide loading
        hideLoading();
        
        // Show success
        const totalClinicians = sheetsData.clinicians.length;
        showToast(`Connected! Loaded ${totalClinicians} clinicians and ${sheetsData.mvps.length} MVPs`);
        
    } catch (error) {
        console.error('Initialization error:', error);
        hideLoading();
        showToast('Error loading data. Check console for details.', 'error');
    }
}

function processExistingData() {
    mvpAssignments = {};
    mvpSelections = {};
    
    if (sheetsData.assignments && sheetsData.assignments.length > 0) {
        sheetsData.assignments.forEach(assignment => {
            if (assignment.is_active === 'Y') {
                const mvpId = assignment.mvp_id;
                const clinicianId = assignment.clinician_id;
                
                if (!mvpAssignments[mvpId]) {
                    mvpAssignments[mvpId] = [];
                }
                mvpAssignments[mvpId].push(clinicianId);
            }
        });
    }
    
    if (sheetsData.selections && sheetsData.selections.length > 0) {
        sheetsData.selections.forEach(selection => {
            const mvpId = selection.mvp_id;
            
            if (!mvpSelections[mvpId]) {
                mvpSelections[mvpId] = {
                    measures: [],
                    configs: {}
                };
            }
            
            mvpSelections[mvpId].measures.push(selection.measure_id);
            mvpSelections[mvpId].configs[selection.measure_id] = {
                collectionType: selection.collection_type,
                difficulty: selection.implementation_status
            };
        });
    }
}

function updateLoadingText(text) {
    const element = document.querySelector('.loading-text');
    if (element) element.textContent = text;
}

function updateLoadingDetails(text) {
    const element = document.getElementById('loading-details');
    if (element) element.textContent = text;
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function loadUnassignedClinicians() {
    const container = document.getElementById('unassigned-list');
    container.innerHTML = '';
    
    const assignedIds = new Set();
    Object.values(mvpAssignments).forEach(clinicians => {
        clinicians.forEach(id => assignedIds.add(String(id)));
    });
    
    const unassigned = sheetsData.clinicians.filter(c => 
        c.is_active === 'Y' && !assignedIds.has(String(c.clinician_id))
    );
    
    console.log(`Found ${unassigned.length} unassigned clinicians out of ${sheetsData.clinicians.length} total`);
    
    unassigned.forEach(clinician => {
        const card = createClinicianCard(clinician);
        container.appendChild(card);
    });
    
    if (unassigned.length === 0) {
        container.innerHTML = '<div class="empty-state">All clinicians assigned</div>';
    }
}

function createClinicianCard(clinician) {
    const card = document.createElement('div');
    card.className = 'clinician-card';
    card.dataset.clinicianId = clinician.clinician_id;
    card.dataset.specialty = clinician.specialty || '';
    
    card.innerHTML = `
        <div style="display: flex; align-items: center;">
            <input type="checkbox" class="selection-checkbox" 
                   onchange="toggleClinicianSelection('${clinician.clinician_id}')"
                   onclick="event.stopPropagation()"
                   style="margin-right: 10px;">
            <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 14px;">
                    ${clinician.full_name || (clinician.last_name + ', ' + clinician.first_name)}
                </div>
                <div style="font-size: 12px; color: #6c757d;">${clinician.specialty || 'No specialty'}</div>
                <div style="font-size: 11px; color: #adb5bd;">NPI: ${clinician.npi}</div>
            </div>
        </div>
    `;
    
    card.addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox') {
            const checkbox = card.querySelector('.selection-checkbox');
            checkbox.checked = !checkbox.checked;
            toggleClinicianSelection(clinician.clinician_id);
        }
    });
    
    return card;
}

function toggleClinicianSelection(clinicianId) {
    const id = String(clinicianId);
    if (selectedClinicians.has(id)) {
        selectedClinicians.delete(id);
    } else {
        selectedClinicians.add(id);
    }
    updateSelectionUI();
}

function updateSelectionUI() {
    document.querySelectorAll('.clinician-card').forEach(card => {
        const id = String(card.dataset.clinicianId);
        const checkbox = card.querySelector('.selection-checkbox');
        if (selectedClinicians.has(id)) {
            card.classList.add('selected');
            if (checkbox) checkbox.checked = true;
        } else {
            card.classList.remove('selected');
            if (checkbox) checkbox.checked = false;
        }
    });
    
    const count = selectedClinicians.size;
    const bulkActions = document.getElementById('bulk-actions');
    
    if (count > 0) {
        bulkActions.classList.add('active');
        document.getElementById('bulk-selected-count').textContent = `${count} selected`;
    } else {
        bulkActions.classList.remove('active');
    }
}

function selectAllVisible() {
    document.querySelectorAll('.clinician-card').forEach(card => {
        if (card.style.display !== 'none') {
            const id = String(card.dataset.clinicianId);
            selectedClinicians.add(id);
        }
    });
    updateSelectionUI();
}

function clearSelection() {
    selectedClinicians.clear();
    updateSelectionUI();
}

function filterClinicians() {
    const specialty = document.getElementById('specialty-filter').value;
    const search = document.getElementById('clinician-search').value.toLowerCase();
    
    document.querySelectorAll('.clinician-card').forEach(card => {
        const cardSpecialty = card.dataset.specialty || '';
        const text = card.textContent.toLowerCase();
        
        const matchesSpecialty = specialty === 'all' || cardSpecialty === specialty;
        const matchesSearch = !search || text.includes(search);
        
        card.style.display = matchesSpecialty && matchesSearch ? 'block' : 'none';
    });
}

function populateFilters() {
    const filter = document.getElementById('specialty-filter');
    const specialties = [...new Set(sheetsData.clinicians.map(c => c.specialty).filter(s => s))].sort();
    
    specialties.forEach(specialty => {
        const count = sheetsData.clinicians.filter(c => c.specialty === specialty).length;
        const option = document.createElement('option');
        option.value = specialty;
        option.textContent = `${specialty} (${count})`;
        filter.appendChild(option);
    });
}

function populateBulkMVPSelect() {
    const select = document.getElementById('bulk-mvp-select');
    sheetsData.mvps.forEach(mvp => {
        const option = document.createElement('option');
        option.value = mvp.mvp_id;
        option.textContent = mvp.mvp_name;
        select.appendChild(option);
    });
}

function bulkAssign() {
    const mvpId = document.getElementById('bulk-mvp-select').value;
    if (!mvpId) {
        showToast('Please select an MVP', 'error');
        return;
    }
    
    if (selectedClinicians.size === 0) {
        showToast('Please select clinicians to assign', 'error');
        return;
    }
    
    if (!mvpAssignments[mvpId]) {
        mvpAssignments[mvpId] = [];
    }
    
    let addedCount = 0;
    selectedClinicians.forEach(clinicianId => {
        if (!mvpAssignments[mvpId].includes(clinicianId)) {
            mvpAssignments[mvpId].push(clinicianId);
            addedCount++;
        }
    });
    
    clearSelection();
    loadUnassignedClinicians();
    updateMVPGrid();
    updateStats();
    
    const mvp = sheetsData.mvps.find(m => m.mvp_id === mvpId);
    showToast(`Assigned ${addedCount} clinicians to ${mvp.mvp_name}`);
    
    selectMVP(mvpId);
}

function updateMVPGrid() {
    const container = document.getElementById('mvp-grid');
    const activeMVPs = sheetsData.mvps.filter(mvp => {
        const assigned = mvpAssignments[mvp.mvp_id];
        return assigned && assigned.length > 0;
    });
    
    if (activeMVPs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <h3>No Active MVPs Yet</h3>
                <p>Select clinicians from the left panel and assign them to an MVP to get started.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    activeMVPs.forEach(mvp => {
        const mvpElement = createMVPCard(mvp);
        container.appendChild(mvpElement);
    });
}

function createMVPCard(mvp) {
    const container = document.createElement('div');
    container.className = 'mvp-container';
    container.onclick = () => selectMVP(mvp.mvp_id);
    
    const assignedClinicians = mvpAssignments[mvp.mvp_id] || [];
    const selectedMeasures = mvpSelections[mvp.mvp_id]?.measures || [];
    
    container.innerHTML = `
        <div class="mvp-header">
            <div class="mvp-title">${mvp.mvp_name}</div>
            <div style="font-size: 11px; opacity: 0.9; margin-top: 4px;">
                ${mvp.eligible_specialties || 'All specialties'}
            </div>
            <div class="mvp-stats">
                <span>👥 ${assignedClinicians.length} clinicians</span>
                <span>📊 ${selectedMeasures.length}/${mvp.required_measures || 4} measures</span>
            </div>
        </div>
        <div class="mvp-body">
            <div style="font-size: 13px; color: #6c757d;">
                ${assignedClinicians.slice(0, 3).map(id => {
                    const clinician = sheetsData.clinicians.find(c => String(c.clinician_id) === String(id));
                    return clinician ? clinician.last_name : 'Unknown';
                }).join(', ')}
                ${assignedClinicians.length > 3 ? ` +${assignedClinicians.length - 3} more` : ''}
            </div>
        </div>
    `;
    
    return container;
}

function selectMVP(mvpId) {
    selectedMVP = mvpId;
    const mvp = sheetsData.mvps.find(m => m.mvp_id === mvpId);
    
    if (mvp) {
        showMVPMeasures(mvp);
        showMVPClinicians(mvp);
        showMVPWorkPlan(mvp);
    }
}

function showMVPMeasures(mvp) {
    const container = document.getElementById('mvp-details');
    const availableMeasures = mvp.available_measures ? mvp.available_measures.split(',').map(m => m.trim()) : [];
    const selectedMeasures = mvpSelections[mvp.mvp_id]?.measures || [];
    
    let html = `<h3>${mvp.mvp_name}</h3>`;
    html += `<p style="font-size: 13px; color: #6c757d; margin-bottom: 15px;">`;
    html += `Select exactly ${mvp.required_measures || 4} measures (${selectedMeasures.length}/${mvp.required_measures || 4} selected)`;
    html += `</p>`;
    
    html += '<div class="measure-selector">';
    
    availableMeasures.forEach(measureId => {
        const measure = sheetsData.measures.find(m => m.measure_id === measureId);
        if (measure) {
            const isSelected = selectedMeasures.includes(measureId);
            
            html += `
                <div class="measure-item ${isSelected ? 'selected' : ''}">
                    <input type="checkbox" 
                           class="measure-checkbox" 
                           ${isSelected ? 'checked' : ''}
                           ${!isSelected && selectedMeasures.length >= (mvp.required_measures || 4) ? 'disabled' : ''}
                           onchange="toggleMeasure('${mvp.mvp_id}', '${measureId}')">
                    <div class="measure-info">
                        <div style="font-weight: 600; font-size: 13px;">${measureId}: ${measure.measure_name}</div>
                        <div style="font-size: 11px; color: #6c757d; margin-top: 4px;">
                            <strong>Collection:</strong> ${measure.collection_types || 'Not specified'}
                        </div>
                        ${measure.is_activated === 'Y' ? 
                            '<span style="color: #28a745; font-size: 11px;">✓ Already activated</span>' :
                            '<span style="color: #dc3545; font-size: 11px;">⚠ Requires implementation</span>'
                        }
                    </div>
                </div>
            `;
        }
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function showMVPClinicians(mvp) {
    const container = document.getElementById('clinicians-details');
    const clinicianIds = mvpAssignments[mvp.mvp_id] || [];
    
    let html = `<h3>Assigned Clinicians (${clinicianIds.length})</h3>`;
    
    if (clinicianIds.length === 0) {
        html += '<div class="empty-state">No clinicians assigned</div>';
    } else {
        clinicianIds.forEach(id => {
            const clinician = sheetsData.clinicians.find(c => String(c.clinician_id) === String(id));
            if (clinician) {
                html += `
                    <div style="padding: 10px; border-bottom: 1px solid #e0e6ed;">
                        <strong>${clinician.full_name || (clinician.last_name + ', ' + clinician.first_name)}</strong><br>
                        <span style="color: #6c757d; font-size: 13px;">
                            ${clinician.specialty || 'No specialty'} • NPI: ${clinician.npi}
                        </span>
                    </div>
                `;
            }
        });
    }
    
    container.innerHTML = html;
}

function showMVPWorkPlan(mvp) {
    const container = document.getElementById('work-details');
    const selectedMeasures = mvpSelections[mvp.mvp_id]?.measures || [];
    
    let html = '<h3>Work Plan</h3>';
    
    if (selectedMeasures.length === 0) {
        html += '<div class="empty-state">Select measures to see work plan</div>';
    } else {
        html += `<h4 style="margin-top: 15px;">Selected Measures (${selectedMeasures.length})</h4>`;
        
        selectedMeasures.forEach(measureId => {
            const measure = sheetsData.measures.find(m => m.measure_id === measureId);
            if (measure) {
                const isActivated = measure.is_activated === 'Y';
                
                html += `
                    <div class="work-item ${isActivated ? 'completed' : ''}">
                        <strong>${measureId}: ${measure.measure_name}</strong><br>
                        ${isActivated ? 
                            '<span style="color: #28a745;">✓ Already implemented</span>' :
                            '<span style="color: #dc3545;">Requires implementation, workflow updates, and staff training</span>'
                        }
                    </div>
                `;
            }
        });
    }
    
    container.innerHTML = html;
}

function toggleMeasure(mvpId, measureId) {
    if (!mvpSelections[mvpId]) {
        mvpSelections[mvpId] = {
            measures: [],
            configs: {}
        };
    }
    
    const index = mvpSelections[mvpId].measures.indexOf(measureId);
    const mvp = sheetsData.mvps.find(m => m.mvp_id === mvpId);
    const maxMeasures = parseInt(mvp.required_measures) || 4;
    
    if (index > -1) {
        mvpSelections[mvpId].measures.splice(index, 1);
        delete mvpSelections[mvpId].configs[measureId];
    } else if (mvpSelections[mvpId].measures.length < maxMeasures) {
        mvpSelections[mvpId].measures.push(measureId);
        const measure = sheetsData.measures.find(m => m.measure_id === measureId);
        mvpSelections[mvpId].configs[measureId] = {
            collectionType: measure.collection_types ? measure.collection_types.split(',')[0].trim() : 'MIPS CQM',
            difficulty: measure.implementation_difficulty || 'Medium'
        };
    }
    
    showMVPMeasures(mvp);
    showMVPWorkPlan(mvp);
    updateMVPGrid();
}

function switchDetailTab(tab) {
    document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(`${tab}-tab`).classList.add('active');
}

function updateStats() {
    const totalClinicians = sheetsData.clinicians.filter(c => c.is_active === 'Y').length;
    const assignedCount = Object.values(mvpAssignments).flat().length;
    const activeMVPs = Object.keys(mvpAssignments).filter(mvpId => 
        mvpAssignments[mvpId].length > 0
    ).length;
    
    document.getElementById('total-clinicians').textContent = totalClinicians || 0;
    document.getElementById('assigned-clinicians').textContent = assignedCount;
    document.getElementById('mvps-active').textContent = activeMVPs;
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function toggleMode() {
    if (currentMode === 'planning') {
        currentMode = 'review';
        document.getElementById('planning-mode').classList.add('hidden');
        document.getElementById('review-mode').classList.add('active');
        document.getElementById('mode-toggle').textContent = 'Planning Mode';
    } else {
        currentMode = 'planning';
        document.getElementById('planning-mode').classList.remove('hidden');
        document.getElementById('review-mode').classList.remove('active');
        document.getElementById('mode-toggle').textContent = 'Review Plan';
    }
}

async function refreshData() {
    showToast('Refreshing data from Google Sheets...');
    await init();
}

function exportPlan() {
    let report = 'MVP STRATEGIC PLAN - Memorial of Converse\n';
    report += '=' .repeat(50) + '\n\n';
    report += `Generated: ${new Date().toLocaleDateString()}\n\n`;
    
    const activeMVPs = sheetsData.mvps.filter(mvp => 
        mvpAssignments[mvp.mvp_id] && mvpAssignments[mvp.mvp_id].length > 0
    );
    
    activeMVPs.forEach(mvp => {
        report += `\n${mvp.mvp_name}\n`;
        report += '-'.repeat(mvp.mvp_name.length) + '\n';
        report += `Clinicians: ${mvpAssignments[mvp.mvp_id].length}\n\n`;
        
        const selectedMeasures = mvpSelections[mvp.mvp_id]?.measures || [];
        if (selectedMeasures.length > 0) {
            report += 'Selected Measures:\n';
            selectedMeasures.forEach(measureId => {
                const measure = sheetsData.measures.find(m => m.measure_id === measureId);
                if (measure) {
                    report += `  - ${measureId}: ${measure.measure_name}\n`;
                    if (measure.is_activated !== 'Y') {
                        report += `    ACTION: Implement measure\n`;
                    }
                }
            });
        }
        
        report += '\nAssigned Clinicians:\n';
        mvpAssignments[mvp.mvp_id].forEach(id => {
            const clinician = sheetsData.clinicians.find(c => String(c.clinician_id) === String(id));
            if (clinician) {
                report += `  - ${clinician.full_name || (clinician.last_name + ', ' + clinician.first_name)} (${clinician.specialty || 'N/A'})\n`;
            }
        });
        
        report += '\n';
    });
    
    const blob = new Blob([report], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mvp-strategic-plan-${Date.now()}.txt`;
    a.click();
    
    showToast('Plan exported successfully!');
}

// Make functions globally accessible
window.toggleClinicianSelection = toggleClinicianSelection;
window.toggleMeasure = toggleMeasure;
window.selectAllVisible = selectAllVisible;
window.clearSelection = clearSelection;
window.filterClinicians = filterClinicians;
window.bulkAssign = bulkAssign;
window.selectMVP = selectMVP;
window.switchDetailTab = switchDetailTab;
window.toggleMode = toggleMode;
window.refreshData = refreshData;
window.exportPlan = exportPlan;
