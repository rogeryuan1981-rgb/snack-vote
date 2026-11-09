export function campaignHeadcountBudget(
    locationIds: string[],
    employees: { id: string; active: boolean; work_location_id: string }[],
    assignments: { employee_id: string; work_location_id: string }[],
) {
    const selected = new Set(locationIds);
    const assigned = new Map<string, Set<string>>();
    for (const row of assignments) {
        const ids = assigned.get(row.employee_id) ?? new Set<string>();
        ids.add(row.work_location_id);
        assigned.set(row.employee_id, ids);
    }
    const ids = new Set(employees.filter(person => person.active &&
        [...(assigned.get(person.id) ?? new Set([person.work_location_id]))].some(id => selected.has(id))
    ).map(person => person.id));
    return { count: ids.size, budget: ids.size * 50 };
}

