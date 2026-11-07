/**
 * RailForge Consist - Genuine MSTS .CON Serializer
 * @license Apache-2.0
 * 
 * Generates 100% syntactically valid Microsoft Train Simulator and Open Rails
 * consist files (.con) with strict header signatures, unique UiD sequencing,
 * and exact indentation.
 */

import { ConsistFile, ConsistVehicleEntry } from '../types/msts';

export function serializeConsist(consist: ConsistFile): string {
  const lines: string[] = [];

  // MSTS 30-character header signature
  lines.push('SIMISA@@@@@@@@@@JINX0D0t______\r\n');
  lines.push('Train (');
  
  const idName = consist.filename.replace(/\.con$/i, '') || 'RailForge_Consist';
  lines.push(`\tTrainCfg ( "${idName}"`);
  lines.push(`\t\tName ( "${consist.name || idName}" )`);
  lines.push(`\t\tSerial ( ${consist.serial || 1} )`);

  const maxVel = consist.maxVelocityMps > 0 ? consist.maxVelocityMps.toFixed(5) : '44.44444';
  lines.push(`\t\tMaxVelocity ( ${maxVel} 0.00100 )`);

  const nextUid = consist.vehicles.length;
  lines.push(`\t\tNextWagonUID ( ${nextUid} )`);
  lines.push(`\t\tDurability ( 1.00000 )`);

  // Serialize each vehicle in sequential order
  consist.vehicles.forEach((veh, index) => {
    const isEngine = veh.type === 'engine';
    const baseFile = veh.filename.replace(/\.(eng|wag)$/i, '');
    const folder = veh.folder;

    if (isEngine) {
      lines.push('\t\tEngine (');
      lines.push(`\t\t\tUiD ( ${index} )`);
      lines.push(`\t\t\tEngineData ( ${baseFile} "${folder}" )`);
      if (veh.flipDirection) {
        lines.push('\t\t\tFlipDirection ( )');
      }
      lines.push('\t\t)');
    } else {
      lines.push('\t\tWagon (');
      lines.push(`\t\t\tWagonData ( ${baseFile} "${folder}" )`);
      lines.push(`\t\t\tUiD ( ${index} )`);
      if (veh.flipDirection) {
        lines.push('\t\t\tFlipDirection ( )');
      }
      lines.push('\t\t)');
    }
  });

  lines.push('\t)');
  lines.push(')');
  lines.push(''); // Final newline

  return lines.join('\r\n');
}

/**
 * Clean and normalize a consist identifier string
 */
export function sanitizeConsistFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
}
