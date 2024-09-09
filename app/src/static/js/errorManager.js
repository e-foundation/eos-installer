/*
 * Copyright 2024 - ECORP SAS 
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
* Class to manage errors
* The Error are NOT translated, as the may not be predicted in all the case
*/
export class ErrorManager {
    constructor() {
    }

    // Display a message relative to when the installer is (Step)
    static displayError_state(caption, message) {
        const errorCaption = document.getElementById('error-caption-state');
        const errorText = document.getElementById('error-text-state');
        errorCaption.textContent = caption;
        errorText.textContent = message;
    }

}